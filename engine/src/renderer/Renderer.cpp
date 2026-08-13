#include "renderer/Renderer.h"
#include "renderer/ShaderLoader.h"
#include "geometry/PrimitiveGenerator.h"
#include "geometry/Mesh.h"
#include <iostream>

namespace renderer {

    wgpu::Buffer Renderer::createBuffer(const void* data, size_t size, wgpu::BufferUsage usage) {
        wgpu::BufferDescriptor desc{};
        desc.size = (size + 3) & ~3; // align to 4 bytes
        desc.usage = usage | wgpu::BufferUsage::CopyDst;
        wgpu::Buffer buffer = device.CreateBuffer(&desc);
        queue.WriteBuffer(buffer, 0, data, size);
        return buffer;
    }

    void Renderer::setup_geometry() {
        geometry::Mesh cube = geometry::PrimitiveGenerator::createCube();
        cubeBuffers.vertexBuffer = createBuffer(cube.vertices.data(), cube.vertices.size() * sizeof(geometry::Vertex), wgpu::BufferUsage::Vertex);
        cubeBuffers.indexBuffer = createBuffer(cube.indices.data(), cube.indices.size() * sizeof(uint32_t), wgpu::BufferUsage::Index);
        cubeBuffers.indexCount = cube.indices.size();

        geometry::Mesh sphere = geometry::PrimitiveGenerator::createSphere();
        sphereBuffers.vertexBuffer = createBuffer(sphere.vertices.data(), sphere.vertices.size() * sizeof(geometry::Vertex), wgpu::BufferUsage::Vertex);
        sphereBuffers.indexBuffer = createBuffer(sphere.indices.data(), sphere.indices.size() * sizeof(uint32_t), wgpu::BufferUsage::Index);
        sphereBuffers.indexCount = sphere.indices.size();

        geometry::Mesh plane = geometry::PrimitiveGenerator::createPlane(5.0f, 5.0f);
        planeBuffers.vertexBuffer = createBuffer(plane.vertices.data(), plane.vertices.size() * sizeof(geometry::Vertex), wgpu::BufferUsage::Vertex);
        planeBuffers.indexBuffer = createBuffer(plane.indices.data(), plane.indices.size() * sizeof(uint32_t), wgpu::BufferUsage::Index);
        planeBuffers.indexCount = plane.indices.size();

        geometry::Mesh torus = geometry::PrimitiveGenerator::createTorus(1.0f, 0.05f, 32, 8);
        torusBuffers.vertexBuffer = createBuffer(torus.vertices.data(), torus.vertices.size() * sizeof(geometry::Vertex), wgpu::BufferUsage::Vertex);
        torusBuffers.indexBuffer = createBuffer(torus.indices.data(), torus.indices.size() * sizeof(uint32_t), wgpu::BufferUsage::Index);
        torusBuffers.indexCount = torus.indices.size();
    }

    void Renderer::setup_render_pipeline() {
        queue = device.GetQueue();
        
        wgpu::EmscriptenSurfaceSourceCanvasHTMLSelector canvasDesc{};
        canvasDesc.selector = wgpu::StringView{"#gpuCanvas", WGPU_STRLEN};
        
        wgpu::SurfaceDescriptor surfaceDesc{};
        surfaceDesc.nextInChain = &canvasDesc;
        
        surface = instance.CreateSurface(&surfaceDesc);
        
        wgpu::SurfaceConfiguration config{};
        config.device = device;
        config.format = swapChainFormat;
        config.width = 800; // default, overridden in resize
        config.height = 600;
        config.presentMode = wgpu::PresentMode::Fifo;
        this->config = config;
        surface.Configure(&this->config);

        setup_geometry();

        // Uniform buffers
        wgpu::BufferDescriptor ubDesc{};
        ubDesc.size = sizeof(UniformData);
        ubDesc.usage = wgpu::BufferUsage::Uniform | wgpu::BufferUsage::CopyDst;
        for (int i = 0; i < MAX_DRAW_CALLS; ++i) {
            uniformBuffers[i] = device.CreateBuffer(&ubDesc);
        }

        std::string wgslCode = ShaderLoader::load("/shaders/pbr.wgsl");
        if (wgslCode.empty()) {
            std::cerr << "Failed to load pbr.wgsl shader code!" << std::endl;
            return;
        }

        wgpu::ShaderSourceWGSL wgslDesc{};
        wgslDesc.code = wgpu::StringView{wgslCode};
        
        wgpu::ShaderModuleDescriptor shaderModuleDesc{};
        shaderModuleDesc.nextInChain = &wgslDesc;
        wgpu::ShaderModule shaderModule = device.CreateShaderModule(&shaderModuleDesc);
        
        // Bind group layout
        wgpu::BindGroupLayoutEntry bglEntry{};
        bglEntry.binding = 0;
        bglEntry.visibility = wgpu::ShaderStage::Vertex | wgpu::ShaderStage::Fragment;
        bglEntry.buffer.type = wgpu::BufferBindingType::Uniform;
        
        wgpu::BindGroupLayoutDescriptor bglDesc{};
        bglDesc.entryCount = 1;
        bglDesc.entries = &bglEntry;
        bindGroupLayout = device.CreateBindGroupLayout(&bglDesc);

        // Bind groups
        for (int i = 0; i < MAX_DRAW_CALLS; ++i) {
            wgpu::BindGroupEntry bgEntry{};
            bgEntry.binding = 0;
            bgEntry.buffer = uniformBuffers[i];
            bgEntry.size = sizeof(UniformData);

            wgpu::BindGroupDescriptor bgDesc{};
            bgDesc.layout = bindGroupLayout;
            bgDesc.entryCount = 1;
            bgDesc.entries = &bgEntry;
            bindGroups[i] = device.CreateBindGroup(&bgDesc);
        }
        
        // Pipeline layout
        wgpu::PipelineLayoutDescriptor plDesc{};
        plDesc.bindGroupLayoutCount = 1;
        plDesc.bindGroupLayouts = &bindGroupLayout;
        wgpu::PipelineLayout pipelineLayout = device.CreatePipelineLayout(&plDesc);

        wgpu::ColorTargetState colorTargetState{};
        colorTargetState.format = swapChainFormat;
        
        wgpu::FragmentState fragmentState{};
        fragmentState.module = shaderModule;
        fragmentState.entryPoint = wgpu::StringView{"fs_main", WGPU_STRLEN};
        fragmentState.targetCount = 1;
        fragmentState.targets = &colorTargetState;
        
        // Vertex attributes
        wgpu::VertexAttribute attributes[3];
        attributes[0].format = wgpu::VertexFormat::Float32x3;
        attributes[0].offset = 0;
        attributes[0].shaderLocation = 0;
        
        attributes[1].format = wgpu::VertexFormat::Float32x3;
        attributes[1].offset = 12;
        attributes[1].shaderLocation = 1;
        
        attributes[2].format = wgpu::VertexFormat::Float32x2;
        attributes[2].offset = 24;
        attributes[2].shaderLocation = 2;

        wgpu::VertexBufferLayout vertexLayout{};
        vertexLayout.arrayStride = sizeof(geometry::Vertex); // 32 bytes
        vertexLayout.stepMode = wgpu::VertexStepMode::Vertex;
        vertexLayout.attributeCount = 3;
        vertexLayout.attributes = attributes;

        // Depth stencil
        wgpu::DepthStencilState depthStencil{};
        depthStencil.format = depthFormat;
        depthStencil.depthWriteEnabled = true;
        depthStencil.depthCompare = wgpu::CompareFunction::Less;

        wgpu::RenderPipelineDescriptor pipelineDesc{};
        pipelineDesc.layout = pipelineLayout;
        pipelineDesc.vertex.module = shaderModule;
        pipelineDesc.vertex.entryPoint = wgpu::StringView{"vs_main", WGPU_STRLEN};
        pipelineDesc.vertex.bufferCount = 1;
        pipelineDesc.vertex.buffers = &vertexLayout;
        pipelineDesc.fragment = &fragmentState;
        pipelineDesc.primitive.topology = wgpu::PrimitiveTopology::TriangleList;
        pipelineDesc.depthStencil = &depthStencil;
        
        pipeline = device.CreateRenderPipeline(&pipelineDesc);
        
        // Gizmo pipeline (always renders on top)
        depthStencil.depthCompare = wgpu::CompareFunction::Always;
        pipelineDesc.depthStencil = &depthStencil;
        gizmoPipeline = device.CreateRenderPipeline(&pipelineDesc);

        std::cout << "Pipelines ready" << std::endl;
    }

    void Renderer::setup_grid_pipeline() {
        wgpu::BufferDescriptor ubDesc{};
        ubDesc.size = sizeof(GridUniformData);
        ubDesc.usage = wgpu::BufferUsage::Uniform | wgpu::BufferUsage::CopyDst;
        gridUniformBuffer = device.CreateBuffer(&ubDesc);

        std::string wgslCode = ShaderLoader::load("/shaders/grid.wgsl");
        if (wgslCode.empty()) {
            std::cerr << "Failed to load grid.wgsl shader code!" << std::endl;
            return;
        }

        wgpu::ShaderSourceWGSL wgslDesc{};
        wgslDesc.code = wgpu::StringView{wgslCode};
        
        wgpu::ShaderModuleDescriptor shaderModuleDesc{};
        shaderModuleDesc.nextInChain = &wgslDesc;
        wgpu::ShaderModule shaderModule = device.CreateShaderModule(&shaderModuleDesc);
        
        wgpu::BindGroupLayoutEntry bglEntry{};
        bglEntry.binding = 0;
        bglEntry.visibility = wgpu::ShaderStage::Vertex | wgpu::ShaderStage::Fragment;
        bglEntry.buffer.type = wgpu::BufferBindingType::Uniform;
        
        wgpu::BindGroupLayoutDescriptor bglDesc{};
        bglDesc.entryCount = 1;
        bglDesc.entries = &bglEntry;
        gridBindGroupLayout = device.CreateBindGroupLayout(&bglDesc);

        wgpu::BindGroupEntry bgEntry{};
        bgEntry.binding = 0;
        bgEntry.buffer = gridUniformBuffer;
        bgEntry.size = sizeof(GridUniformData);

        wgpu::BindGroupDescriptor bgDesc{};
        bgDesc.layout = gridBindGroupLayout;
        bgDesc.entryCount = 1;
        bgDesc.entries = &bgEntry;
        gridBindGroup = device.CreateBindGroup(&bgDesc);
        
        wgpu::PipelineLayoutDescriptor plDesc{};
        plDesc.bindGroupLayoutCount = 1;
        plDesc.bindGroupLayouts = &gridBindGroupLayout;
        wgpu::PipelineLayout pipelineLayout = device.CreatePipelineLayout(&plDesc);

        wgpu::BlendState blendState{};
        blendState.color.srcFactor = wgpu::BlendFactor::SrcAlpha;
        blendState.color.dstFactor = wgpu::BlendFactor::OneMinusSrcAlpha;
        blendState.color.operation = wgpu::BlendOperation::Add;
        blendState.alpha.srcFactor = wgpu::BlendFactor::One;
        blendState.alpha.dstFactor = wgpu::BlendFactor::OneMinusSrcAlpha;
        blendState.alpha.operation = wgpu::BlendOperation::Add;

        wgpu::ColorTargetState colorTargetState{};
        colorTargetState.format = swapChainFormat;
        colorTargetState.blend = &blendState;
        
        wgpu::FragmentState fragmentState{};
        fragmentState.module = shaderModule;
        fragmentState.entryPoint = wgpu::StringView{"fs_main", WGPU_STRLEN};
        fragmentState.targetCount = 1;
        fragmentState.targets = &colorTargetState;

        wgpu::DepthStencilState depthStencil{};
        depthStencil.format = depthFormat;
        depthStencil.depthWriteEnabled = true;
        depthStencil.depthCompare = wgpu::CompareFunction::LessEqual; // LessEqual so it renders correctly with Z=1

        wgpu::RenderPipelineDescriptor pipelineDesc{};
        pipelineDesc.layout = pipelineLayout;
        pipelineDesc.vertex.module = shaderModule;
        pipelineDesc.vertex.entryPoint = wgpu::StringView{"vs_main", WGPU_STRLEN};
        pipelineDesc.fragment = &fragmentState;
        pipelineDesc.primitive.topology = wgpu::PrimitiveTopology::TriangleList;
        pipelineDesc.depthStencil = &depthStencil;
        
        gridPipeline = device.CreateRenderPipeline(&pipelineDesc);
        std::cout << "Grid Pipeline ready" << std::endl;
    }

    void Renderer::init(scene::Scene& sceneGraph, scene::Camera& camera, int width, int height) {
        instance = wgpu::CreateInstance();
        instance.RequestAdapter(nullptr, wgpu::CallbackMode::AllowSpontaneous, [this, width, height](wgpu::RequestAdapterStatus status, wgpu::Adapter cAdapter, wgpu::StringView message) {
            if (status != wgpu::RequestAdapterStatus::Success) {
                std::cerr << "Failed to acquire adapter" << std::endl;
                return;
            }
            wgpu::Adapter adapter = cAdapter;
            adapter.RequestDevice(nullptr, wgpu::CallbackMode::AllowSpontaneous, [this, width, height](wgpu::RequestDeviceStatus status, wgpu::Device cDevice, wgpu::StringView message) {
                if (status != wgpu::RequestDeviceStatus::Success) {
                    std::cerr << "Failed to acquire device" << std::endl;
                    return;
                }
                device = cDevice;
                setup_render_pipeline();
                setup_grid_pipeline();
                resize(width, height);
            });
        });

        sceneGraph.root->position = math::vec3(0, 0, 0);
        camera.position = math::vec3(2, 2, 5);
    }

    void Renderer::resize(int width, int height) {
        if (!device) return;
        config.width = width;
        config.height = height;
        surface.Configure(&config);
        
        if (depthTexture) depthTexture.Destroy();
        wgpu::TextureDescriptor desc{};
        desc.usage = wgpu::TextureUsage::RenderAttachment;
        desc.dimension = wgpu::TextureDimension::e2D;
        desc.size = { (uint32_t)width, (uint32_t)height, 1 };
        desc.format = depthFormat;
        desc.mipLevelCount = 1;
        desc.sampleCount = 1;
        
        depthTexture = device.CreateTexture(&desc);
        depthTextureView = depthTexture.CreateView();
    }

    void Renderer::update_depth_texture() {
        // Now handled by resize()
    }

    void Renderer::render_frame(scene::Scene& sceneGraph, scene::Camera& camera, scene::Node* selectedNode, int gizmoMode) {
        if (!device) return;

        wgpu::SurfaceTexture surfaceTexture;
        surface.GetCurrentTexture(&surfaceTexture);
        if (!surfaceTexture.texture) return;

        wgpu::TextureView backBuffer = surfaceTexture.texture.CreateView();

        sceneGraph.update();

        wgpu::CommandEncoder encoder = device.CreateCommandEncoder();
        
        wgpu::RenderPassColorAttachment colorAttachment{};
        colorAttachment.view = backBuffer;
        colorAttachment.loadOp = wgpu::LoadOp::Clear;
        colorAttachment.storeOp = wgpu::StoreOp::Store;
        colorAttachment.clearValue = {0.1, 0.1, 0.12, 1.0};

        wgpu::RenderPassDepthStencilAttachment depthAttachment{};
        depthAttachment.view = depthTextureView;
        depthAttachment.depthLoadOp = wgpu::LoadOp::Clear;
        depthAttachment.depthStoreOp = wgpu::StoreOp::Store;
        depthAttachment.depthClearValue = 1.0f;
        
        wgpu::RenderPassDescriptor renderPassDesc{};
        renderPassDesc.colorAttachmentCount = 1;
        renderPassDesc.colorAttachments = &colorAttachment;
        renderPassDesc.depthStencilAttachment = &depthAttachment;
        
        wgpu::RenderPassEncoder pass = encoder.BeginRenderPass(&renderPassDesc);

        // Draw Grid
        pass.SetPipeline(gridPipeline);
        
        GridUniformData gridData;
        gridData.viewProj = camera.getProjectionMatrix() * camera.getViewMatrix();
        gridData.invViewProj = gridData.viewProj.inverse();
        gridData.cameraPos = camera.position;
        
        queue.WriteBuffer(gridUniformBuffer, 0, &gridData, sizeof(GridUniformData));
        pass.SetBindGroup(0, gridBindGroup);
        pass.Draw(6, 1, 0, 0);

        // Draw Scene
        pass.SetPipeline(pipeline);

        int bufferIndex = 0;
        auto flatNodes = sceneGraph.getRenderList();
        for (const auto& node : flatNodes) {
            if (node->meshType == scene::MeshType::None) continue;
            
            MeshBuffers* buffers = nullptr;
            if (node->meshType == scene::MeshType::Cube) buffers = &cubeBuffers;
            else if (node->meshType == scene::MeshType::Sphere) buffers = &sphereBuffers;
            else if (node->meshType == scene::MeshType::Plane) buffers = &planeBuffers;
            else if (node->meshType == scene::MeshType::Torus) buffers = &torusBuffers;
            
            if (!buffers) continue;

            UniformData uData;
            uData.viewProj = camera.getProjectionMatrix() * camera.getViewMatrix();
            uData.model = node->worldTransform;
            uData.cameraPos = camera.position;
            uData.padding1 = 0.0f; // Not a gizmo
            
            if (node == selectedNode) {
                uData.albedoMetallic = math::vec3(1, 0.5f, 0); // Orange when selected
            } else {
                uData.albedoMetallic = math::vec3(0.8f, 0.8f, 0.8f);
            }

            uData.metallic = 0.5f;
            uData.lightDir = math::vec3(1, 1, 1).normalize();
            uData.roughness = 0.2f;

            queue.WriteBuffer(uniformBuffers[bufferIndex], 0, &uData, sizeof(UniformData));
            pass.SetBindGroup(0, bindGroups[bufferIndex]);
            
            pass.SetVertexBuffer(0, buffers->vertexBuffer);
            pass.SetIndexBuffer(buffers->indexBuffer, wgpu::IndexFormat::Uint32);
            pass.DrawIndexed(buffers->indexCount, 1, 0, 0, 0);

            bufferIndex++;
            if (bufferIndex >= MAX_DRAW_CALLS) break;
        }

        // Render Gizmos if a node is selected
        if (selectedNode) {
            pass.SetPipeline(gizmoPipeline); // Always render on top
            
            for (int i = 0; i < 3; ++i) {
                UniformData uData;
                uData.viewProj = camera.getProjectionMatrix() * camera.getViewMatrix();
                uData.cameraPos = camera.position;
                uData.padding1 = 1.0f; // isGizmo flag
                
                math::vec3 worldPos(selectedNode->worldTransform.m[12], 
                                    selectedNode->worldTransform.m[13], 
                                    selectedNode->worldTransform.m[14]);
                math::mat4 mTranslate = math::mat4::translation(worldPos);
                math::vec3 color;
                
                // Keep gizmo size constant relative to screen
                float dist = (camera.position - worldPos).length();
                float scale = dist * 0.15f; 
                
                if (gizmoMode == 1) { // Translate (Arrows using Cube)
                    pass.SetVertexBuffer(0, cubeBuffers.vertexBuffer);
                    pass.SetIndexBuffer(cubeBuffers.indexBuffer, wgpu::IndexFormat::Uint32);
                    
                    math::mat4 mScale, mRotate;
                    if (i == 0) {
                        mScale = math::mat4::scaling(math::vec3(scale, scale * 0.05f, scale * 0.05f));
                        mRotate = math::mat4::translation(math::vec3(0.5f, 0, 0));
                        color = math::vec3(1, 0, 0);
                    } else if (i == 1) {
                        mScale = math::mat4::scaling(math::vec3(scale * 0.05f, scale, scale * 0.05f));
                        mRotate = math::mat4::translation(math::vec3(0, 0.5f, 0));
                        color = math::vec3(0, 1, 0);
                    } else {
                        mScale = math::mat4::scaling(math::vec3(scale * 0.05f, scale * 0.05f, scale));
                        mRotate = math::mat4::translation(math::vec3(0, 0, 0.5f));
                        color = math::vec3(0, 0, 1);
                    }
                    uData.model = mTranslate * mScale * mRotate;
                    uData.albedoMetallic = color;
                    queue.WriteBuffer(uniformBuffers[bufferIndex], 0, &uData, sizeof(UniformData));
                    pass.SetBindGroup(0, bindGroups[bufferIndex]);
                    pass.DrawIndexed(cubeBuffers.indexCount, 1, 0, 0, 0);
                    bufferIndex++;
                } else if (gizmoMode == 2) { // Rotate (Rings using Torus)
                    pass.SetVertexBuffer(0, torusBuffers.vertexBuffer);
                    pass.SetIndexBuffer(torusBuffers.indexBuffer, wgpu::IndexFormat::Uint32);
                    
                    math::mat4 mScale = math::mat4::scaling(math::vec3(scale, scale, scale));
                    math::mat4 mRotate;
                    if (i == 0) { // YZ plane (Red)
                        mRotate = math::quat::fromAxisAngle(math::vec3(0, 0, 1), 3.14159f / 2.0f).toMat4();
                        color = math::vec3(1, 0, 0);
                    } else if (i == 1) { // XZ plane (Green)
                        mRotate = math::mat4::identity();
                        color = math::vec3(0, 1, 0);
                    } else { // XY plane (Blue)
                        mRotate = math::quat::fromAxisAngle(math::vec3(1, 0, 0), 3.14159f / 2.0f).toMat4();
                        color = math::vec3(0, 0, 1);
                    }
                    uData.model = mTranslate * mRotate * mScale;
                    uData.albedoMetallic = color;
                    queue.WriteBuffer(uniformBuffers[bufferIndex], 0, &uData, sizeof(UniformData));
                    pass.SetBindGroup(0, bindGroups[bufferIndex]);
                    pass.DrawIndexed(torusBuffers.indexCount, 1, 0, 0, 0);
                    bufferIndex++;
                } else if (gizmoMode == 3) { // Scale (Line + Cube)
                    pass.SetVertexBuffer(0, cubeBuffers.vertexBuffer);
                    pass.SetIndexBuffer(cubeBuffers.indexBuffer, wgpu::IndexFormat::Uint32);
                    
                    float offset = 1.0f + selectedNode->scale.length() * 0.5f; 
                    
                    // 1. Draw Line
                    math::mat4 mScaleLine, mRotateLine;
                    if (i == 0) {
                        mScaleLine = math::mat4::scaling(math::vec3(offset, scale * 0.05f, scale * 0.05f));
                        mRotateLine = math::mat4::translation(math::vec3(0.5f, 0, 0));
                        color = math::vec3(1, 0, 0);
                    } else if (i == 1) {
                        mScaleLine = math::mat4::scaling(math::vec3(scale * 0.05f, offset, scale * 0.05f));
                        mRotateLine = math::mat4::translation(math::vec3(0, 0.5f, 0));
                        color = math::vec3(0, 1, 0);
                    } else {
                        mScaleLine = math::mat4::scaling(math::vec3(scale * 0.05f, scale * 0.05f, offset));
                        mRotateLine = math::mat4::translation(math::vec3(0, 0, 0.5f));
                        color = math::vec3(0, 0, 1);
                    }
                    uData.model = mTranslate * mScaleLine * mRotateLine;
                    uData.albedoMetallic = color;
                    queue.WriteBuffer(uniformBuffers[bufferIndex], 0, &uData, sizeof(UniformData));
                    pass.SetBindGroup(0, bindGroups[bufferIndex]);
                    pass.DrawIndexed(cubeBuffers.indexCount, 1, 0, 0, 0);
                    bufferIndex++;

                    // 2. Draw Cube End
                    math::mat4 mScaleCube = math::mat4::scaling(math::vec3(scale * 0.2f, scale * 0.2f, scale * 0.2f));
                    math::mat4 mRotateCube;
                    if (i == 0) mRotateCube = math::mat4::translation(math::vec3(offset, 0, 0));
                    else if (i == 1) mRotateCube = math::mat4::translation(math::vec3(0, offset, 0));
                    else mRotateCube = math::mat4::translation(math::vec3(0, 0, offset));
                    
                    uData.model = mTranslate * mRotateCube * mScaleCube; // Translate, then offset, then scale
                    queue.WriteBuffer(uniformBuffers[bufferIndex], 0, &uData, sizeof(UniformData));
                    pass.SetBindGroup(0, bindGroups[bufferIndex]);
                    pass.DrawIndexed(cubeBuffers.indexCount, 1, 0, 0, 0);
                    bufferIndex++;
                }
            }
        }

        pass.End();
        
        wgpu::CommandBuffer commands = encoder.Finish();
        queue.Submit(1, &commands);
    }

}

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
        vertexBuffer = createBuffer(cube.vertices.data(), cube.vertices.size() * sizeof(geometry::Vertex), wgpu::BufferUsage::Vertex);
        indexBuffer = createBuffer(cube.indices.data(), cube.indices.size() * sizeof(uint32_t), wgpu::BufferUsage::Index);
        indexCount = cube.indices.size();
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
        std::cout << "Pipeline ready" << std::endl;
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

    void Renderer::render_frame(scene::Scene& sceneGraph, scene::Camera& camera, scene::Node* selectedNode) {
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
        pass.SetVertexBuffer(0, vertexBuffer);
        pass.SetIndexBuffer(indexBuffer, wgpu::IndexFormat::Uint32);

        int bufferIndex = 0;

        auto nodes = sceneGraph.getRenderList();
        for (auto* node : nodes) {
            UniformData uData;
            uData.viewProj = camera.getProjectionMatrix() * camera.getViewMatrix();
            uData.model = node->worldTransform;
            uData.cameraPos = camera.position;
            
            if (selectedNode == node) {
                uData.albedoMetallic = math::vec3(0.0f, 1.0f, 0.0f); // Green for selected
            } else {
                uData.albedoMetallic = math::vec3(0.3f, 0.3f, 0.3f); // Grey default
            }

            uData.metallic = 0.5f;
            uData.lightDir = math::vec3(1, 1, 1).normalize();
            uData.roughness = 0.2f;

            queue.WriteBuffer(uniformBuffers[bufferIndex], 0, &uData, sizeof(UniformData));
            pass.SetBindGroup(0, bindGroups[bufferIndex]);
            pass.DrawIndexed(indexCount, 1, 0, 0, 0);
            bufferIndex++;
        }

        // Render Gizmos if a node is selected
        if (selectedNode) {
            math::vec3 pos = selectedNode->worldTransform * math::vec3(0, 0, 0);
            
            auto drawGizmo = [&](const math::vec3& color, const math::vec3& scale, const math::vec3& offset) {
                UniformData uData;
                uData.viewProj = camera.getProjectionMatrix() * camera.getViewMatrix();
                uData.model = math::mat4::translation(pos + offset) * math::mat4::scaling(scale);
                uData.cameraPos = camera.position;
                uData.albedoMetallic = color;
                uData.metallic = 0.1f;
                uData.lightDir = math::vec3(1, 1, 1).normalize();
                uData.roughness = 0.9f;

                queue.WriteBuffer(uniformBuffers[bufferIndex], 0, &uData, sizeof(UniformData));
                pass.SetBindGroup(0, bindGroups[bufferIndex]);
                pass.DrawIndexed(indexCount, 1, 0, 0, 0);
                bufferIndex++;
            };

            drawGizmo(math::vec3(1, 0, 0), math::vec3(2.0f, 0.05f, 0.05f), math::vec3(1.0f, 0, 0));
            drawGizmo(math::vec3(0, 1, 0), math::vec3(0.05f, 2.0f, 0.05f), math::vec3(0, 1.0f, 0));
            drawGizmo(math::vec3(0, 0, 1), math::vec3(0.05f, 0.05f, 2.0f), math::vec3(0, 0, 1.0f));
        }

        pass.End();
        
        wgpu::CommandBuffer commands = encoder.Finish();
        queue.Submit(1, &commands);
    }

}

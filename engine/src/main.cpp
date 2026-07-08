#include <webgpu/webgpu_cpp.h>
#include <emscripten/bind.h>
#include <emscripten/html5.h>
#include <iostream>
#include <string_view>
#include <vector>

#include "scene/Scene.h"
#include "scene/Camera.h"
#include "geometry/PrimitiveGenerator.h"

int add(int a, int b) { return a + b; }

wgpu::Instance instance;
wgpu::Device device;
wgpu::Queue queue;
wgpu::RenderPipeline pipeline;
wgpu::Surface surface;
wgpu::TextureFormat swapChainFormat = wgpu::TextureFormat::BGRA8Unorm;
wgpu::TextureFormat depthFormat = wgpu::TextureFormat::Depth24Plus;

scene::Scene sceneGraph;
scene::Camera camera;

wgpu::Buffer vertexBuffer;
wgpu::Buffer indexBuffer;
uint32_t indexCount = 0;

wgpu::Buffer uniformBuffer;
wgpu::BindGroup bindGroup;

struct UniformData {
    math::mat4 viewProj;
    math::mat4 model;
    math::vec3 cameraPos; float padding1;
    math::vec3 albedoMetallic; float metallic;
    math::vec3 lightDir; float roughness;
};

UniformData uData;

wgpu::Buffer createBuffer(const void* data, size_t size, wgpu::BufferUsage usage) {
    wgpu::BufferDescriptor desc{};
    desc.size = (size + 3) & ~3; // align to 4 bytes
    desc.usage = usage | wgpu::BufferUsage::CopyDst;
    wgpu::Buffer buffer = device.CreateBuffer(&desc);
    queue.WriteBuffer(buffer, 0, data, size);
    return buffer;
}

void setup_geometry() {
    geometry::Mesh cube = geometry::PrimitiveGenerator::createCube();
    vertexBuffer = createBuffer(cube.vertices.data(), cube.vertices.size() * sizeof(geometry::Vertex), wgpu::BufferUsage::Vertex);
    indexBuffer = createBuffer(cube.indices.data(), cube.indices.size() * sizeof(uint32_t), wgpu::BufferUsage::Index);
    indexCount = cube.indices.size();
}

void setup_render_pipeline() {
    queue = device.GetQueue();
    
    wgpu::EmscriptenSurfaceSourceCanvasHTMLSelector canvasDesc{};
    canvasDesc.selector = wgpu::StringView{"#gpuCanvas", WGPU_STRLEN};
    
    wgpu::SurfaceDescriptor surfaceDesc{};
    surfaceDesc.nextInChain = &canvasDesc;
    
    surface = instance.CreateSurface(&surfaceDesc);
    
    wgpu::SurfaceConfiguration config{};
    config.device = device;
    config.format = swapChainFormat;
    config.width = 800;
    config.height = 600;
    config.presentMode = wgpu::PresentMode::Fifo;
    surface.Configure(&config);

    setup_geometry();

    // Uniform buffer
    wgpu::BufferDescriptor ubDesc{};
    ubDesc.size = sizeof(UniformData);
    ubDesc.usage = wgpu::BufferUsage::Uniform | wgpu::BufferUsage::CopyDst;
    uniformBuffer = device.CreateBuffer(&ubDesc);

    const char* wgsl = R"(
        struct Uniforms {
            viewProj : mat4x4<f32>,
            model : mat4x4<f32>,
            cameraPos : vec4<f32>,
            albedoMetallic : vec4<f32>, 
            lightDirRoughness : vec4<f32>,
        };

        @group(0) @binding(0) var<uniform> u : Uniforms;

        struct VertexInput {
            @location(0) position : vec3<f32>,
            @location(1) normal : vec3<f32>,
            @location(2) uv : vec2<f32>,
        };

        struct VertexOutput {
            @builtin(position) position : vec4<f32>,
            @location(0) worldPos : vec3<f32>,
            @location(1) normal : vec3<f32>,
            @location(2) uv : vec2<f32>,
        };

        @vertex
        fn vs_main(in : VertexInput) -> VertexOutput {
            var out : VertexOutput;
            let worldPos = u.model * vec4<f32>(in.position, 1.0);
            out.worldPos = worldPos.xyz;
            out.position = u.viewProj * worldPos;
            out.normal = (u.model * vec4<f32>(in.normal, 0.0)).xyz;
            out.uv = in.uv;
            return out;
        }

        @fragment
        fn fs_main(in : VertexOutput) -> @location(0) vec4<f32> {
            let N = normalize(in.normal);
            let L = normalize(u.lightDirRoughness.xyz);
            let V = normalize(u.cameraPos.xyz - in.worldPos);
            let H = normalize(V + L);

            let albedo = u.albedoMetallic.rgb;
            let metallic = u.albedoMetallic.a;
            let roughness = max(u.lightDirRoughness.a, 0.04);

            let NdotL = max(dot(N, L), 0.0);
            let NdotV = max(dot(N, V), 0.0);
            
            let ambient = vec3<f32>(0.03) * albedo;

            if (NdotL > 0.0) {
                let F0 = mix(vec3<f32>(0.04), albedo, metallic);
                let cosTheta = max(dot(H, V), 0.0);
                let F = F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);

                let a = roughness * roughness;
                let a2 = a * a;
                let NdotH = max(dot(N, H), 0.0);
                let num = a2;
                let denom = (NdotH * NdotH * (a2 - 1.0) + 1.0);
                let D = num / (3.14159 * denom * denom);

                let k = (roughness + 1.0) * (roughness + 1.0) / 8.0;
                let ggx1 = NdotV / (NdotV * (1.0 - k) + k);
                let ggx2 = NdotL / (NdotL * (1.0 - k) + k);
                let G = ggx1 * ggx2;

                let numerator = D * G * F;
                let denominator = 4.0 * NdotV * NdotL + 0.0001;
                let specular = numerator / denominator;

                let kD = (vec3<f32>(1.0) - F) * (1.0 - metallic);
                let color = ambient + (kD * albedo / 3.14159 + specular) * vec3<f32>(1.0) * NdotL;

                let finalColor = pow(color, vec3<f32>(1.0 / 2.2));
                return vec4<f32>(finalColor, 1.0);
            }

            return vec4<f32>(pow(ambient, vec3<f32>(1.0 / 2.2)), 1.0);
        }
    )";
    
    wgpu::ShaderSourceWGSL wgslDesc{};
    wgslDesc.code = wgpu::StringView{std::string_view(wgsl)};
    
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
    wgpu::BindGroupLayout bindGroupLayout = device.CreateBindGroupLayout(&bglDesc);

    // Bind group
    wgpu::BindGroupEntry bgEntry{};
    bgEntry.binding = 0;
    bgEntry.buffer = uniformBuffer;
    bgEntry.size = sizeof(UniformData);

    wgpu::BindGroupDescriptor bgDesc{};
    bgDesc.layout = bindGroupLayout;
    bgDesc.entryCount = 1;
    bgDesc.entries = &bgEntry;
    bindGroup = device.CreateBindGroup(&bgDesc);
    
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

void init_renderer() {
    instance = wgpu::CreateInstance();
    instance.RequestAdapter(nullptr, wgpu::CallbackMode::AllowSpontaneous, [](wgpu::RequestAdapterStatus status, wgpu::Adapter cAdapter, wgpu::StringView message) {
        if (status != wgpu::RequestAdapterStatus::Success) {
            std::cerr << "Failed to acquire adapter" << std::endl;
            return;
        }
        wgpu::Adapter adapter = cAdapter;
        adapter.RequestDevice(nullptr, wgpu::CallbackMode::AllowSpontaneous, [](wgpu::RequestDeviceStatus status, wgpu::Device cDevice, wgpu::StringView message) {
            if (status != wgpu::RequestDeviceStatus::Success) {
                std::cerr << "Failed to acquire device" << std::endl;
                return;
            }
            device = cDevice;
            setup_render_pipeline();
        });
    });

    sceneGraph.root->position = math::vec3(0, 0, 0);
    camera.position = math::vec3(2, 2, 5);
}

wgpu::Texture depthTexture;
wgpu::TextureView depthTextureView;

void update_depth_texture() {
    if (depthTexture) {
        return; // Fixed size for now
    }
    wgpu::TextureDescriptor desc{};
    desc.usage = wgpu::TextureUsage::RenderAttachment;
    desc.dimension = wgpu::TextureDimension::e2D;
    desc.size = {800, 600, 1};
    desc.format = depthFormat;
    desc.mipLevelCount = 1;
    desc.sampleCount = 1;
    
    depthTexture = device.CreateTexture(&desc);
    depthTextureView = depthTexture.CreateView();
}

void render_frame() {
    if (!device) return;

    wgpu::SurfaceTexture surfaceTexture;
    surface.GetCurrentTexture(&surfaceTexture);
    if (!surfaceTexture.texture) return;

    update_depth_texture();

    wgpu::TextureView backBuffer = surfaceTexture.texture.CreateView();

    sceneGraph.update();

    uData.viewProj = camera.getProjectionMatrix() * camera.getViewMatrix();
    uData.model = sceneGraph.root->worldTransform;
    uData.cameraPos = camera.position;
    uData.albedoMetallic = math::vec3(1.0f, 0.5f, 0.2f);
    uData.metallic = 0.5f;
    uData.lightDir = math::vec3(1, 1, 1).normalize();
    uData.roughness = 0.2f;

    queue.WriteBuffer(uniformBuffer, 0, &uData, sizeof(UniformData));

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
    pass.SetPipeline(pipeline);
    pass.SetBindGroup(0, bindGroup);
    pass.SetVertexBuffer(0, vertexBuffer);
    pass.SetIndexBuffer(indexBuffer, wgpu::IndexFormat::Uint32);
    pass.DrawIndexed(indexCount, 1, 0, 0, 0);
    pass.End();
    
    wgpu::CommandBuffer commands = encoder.Finish();
    queue.Submit(1, &commands);
}

// Camera manipulation bindings
void orbit_camera(float dx, float dy) { camera.orbit(dx, dy); }
void pan_camera(float dx, float dy) { camera.pan(dx, dy); }
void zoom_camera(float amount) { camera.zoom(amount); }

EMSCRIPTEN_BINDINGS(my_module) {
    emscripten::function("add", &add);
    emscripten::function("init_renderer", &init_renderer);
    emscripten::function("render_frame", &render_frame);
    emscripten::function("orbit_camera", &orbit_camera);
    emscripten::function("pan_camera", &pan_camera);
    emscripten::function("zoom_camera", &zoom_camera);
}

#include <webgpu/webgpu_cpp.h>
#include <emscripten/bind.h>
#include <emscripten/html5.h>
#include <iostream>
#include <string_view>

int add(int a, int b) { return a + b; }

wgpu::Instance instance;
wgpu::Device device;
wgpu::Queue queue;
wgpu::RenderPipeline pipeline;
wgpu::Surface surface;
wgpu::TextureFormat swapChainFormat = wgpu::TextureFormat::BGRA8Unorm;

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

    const char* wgsl = R"(
        @vertex
        fn vs_main(@builtin(vertex_index) in_vertex_index: u32) -> @builtin(position) vec4<f32> {
            var p = vec2<f32>(0.0, 0.0);
            if (in_vertex_index == 0u) { p = vec2<f32>(-0.5, -0.5); }
            else if (in_vertex_index == 1u) { p = vec2<f32>(0.5, -0.5); }
            else { p = vec2<f32>(0.0, 0.5); }
            return vec4<f32>(p, 0.0, 1.0);
        }

        @fragment
        fn fs_main() -> @location(0) vec4<f32> {
            return vec4<f32>(1.0, 0.5, 0.2, 1.0);
        }
    )";
    
    wgpu::ShaderSourceWGSL wgslDesc{};
    wgslDesc.code = wgpu::StringView{std::string_view(wgsl)};
    
    wgpu::ShaderModuleDescriptor shaderModuleDesc{};
    shaderModuleDesc.nextInChain = &wgslDesc;
    wgpu::ShaderModule shaderModule = device.CreateShaderModule(&shaderModuleDesc);
    
    wgpu::ColorTargetState colorTargetState{};
    colorTargetState.format = swapChainFormat;
    
    wgpu::FragmentState fragmentState{};
    fragmentState.module = shaderModule;
    fragmentState.entryPoint = wgpu::StringView{"fs_main", WGPU_STRLEN};
    fragmentState.targetCount = 1;
    fragmentState.targets = &colorTargetState;
    
    wgpu::RenderPipelineDescriptor pipelineDesc{};
    pipelineDesc.vertex.module = shaderModule;
    pipelineDesc.vertex.entryPoint = wgpu::StringView{"vs_main", WGPU_STRLEN};
    pipelineDesc.fragment = &fragmentState;
    pipelineDesc.primitive.topology = wgpu::PrimitiveTopology::TriangleList;
    
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
}

void render_frame() {
    if (!device) return;

    wgpu::SurfaceTexture surfaceTexture;
    surface.GetCurrentTexture(&surfaceTexture);
    if (!surfaceTexture.texture) return;

    wgpu::TextureView backBuffer = surfaceTexture.texture.CreateView();

    wgpu::CommandEncoder encoder = device.CreateCommandEncoder();
    
    wgpu::RenderPassColorAttachment colorAttachment{};
    colorAttachment.view = backBuffer;
    colorAttachment.loadOp = wgpu::LoadOp::Clear;
    colorAttachment.storeOp = wgpu::StoreOp::Store;
    colorAttachment.clearValue = {0.1, 0.1, 0.12, 1.0};
    
    wgpu::RenderPassDescriptor renderPassDesc{};
    renderPassDesc.colorAttachmentCount = 1;
    renderPassDesc.colorAttachments = &colorAttachment;
    
    wgpu::RenderPassEncoder pass = encoder.BeginRenderPass(&renderPassDesc);
    pass.SetPipeline(pipeline);
    pass.Draw(3, 1, 0, 0);
    pass.End();
    
    wgpu::CommandBuffer commands = encoder.Finish();
    queue.Submit(1, &commands);
}

EMSCRIPTEN_BINDINGS(my_module) {
    emscripten::function("add", &add);
    emscripten::function("init_renderer", &init_renderer);
    emscripten::function("render_frame", &render_frame);
}

#pragma once

#include <webgpu/webgpu_cpp.h>
#include "math/vec3.h"
#include "math/mat4.h"
#include "scene/Scene.h"
#include "scene/Camera.h"
#include "scene/Node.h"

namespace renderer {

    struct UniformData {
        math::mat4 viewProj;
        math::mat4 model;
        math::vec3 cameraPos; float padding1;
        math::vec3 albedoMetallic; float metallic;
        math::vec3 lightDir; float roughness;
    };

    struct GridUniformData {
        math::mat4 viewProj;
        math::mat4 invViewProj;
        math::vec3 cameraPos; float padding1;
    };

    class Renderer {
    public:
        static const int MAX_DRAW_CALLS = 100;

        void init(scene::Scene& sceneGraph, scene::Camera& camera, int width, int height);
        void resize(int width, int height);
        void render_frame(scene::Scene& sceneGraph, scene::Camera& camera, scene::Node* selectedNode, int gizmoMode);

    private:
        wgpu::Buffer createBuffer(const void* data, size_t size, wgpu::BufferUsage usage);
        void setup_geometry();
        void setup_render_pipeline();
        void setup_grid_pipeline();
        void update_depth_texture();

        wgpu::Instance instance;
        wgpu::Device device;
        wgpu::Queue queue;
        
        wgpu::RenderPipeline pipeline;          // General pipeline for meshes
        wgpu::RenderPipeline gizmoPipeline;     // Pipeline for gizmo
        wgpu::RenderPipeline gridPipeline;      // Pipeline for grid
        
        wgpu::Surface surface;
        wgpu::TextureFormat swapChainFormat = wgpu::TextureFormat::BGRA8Unorm;
        wgpu::TextureFormat depthFormat = wgpu::TextureFormat::Depth24Plus;
        wgpu::SurfaceConfiguration config{};

        struct MeshBuffers {
            wgpu::Buffer vertexBuffer;
            wgpu::Buffer indexBuffer;
            uint32_t indexCount = 0;
        };

        MeshBuffers cubeBuffers;
        MeshBuffers sphereBuffers;
        MeshBuffers planeBuffers;
        MeshBuffers torusBuffers;

        wgpu::Buffer uniformBuffers[MAX_DRAW_CALLS];
        wgpu::BindGroup bindGroups[MAX_DRAW_CALLS];
        wgpu::BindGroupLayout bindGroupLayout;

        wgpu::Buffer gridUniformBuffer;
        wgpu::BindGroup gridBindGroup;
        wgpu::BindGroupLayout gridBindGroupLayout;

        wgpu::Texture depthTexture;
        wgpu::TextureView depthTextureView;
    };

}

#include <emscripten/bind.h>
#include "scene/Scene.h"
#include "scene/Camera.h"
#include "renderer/Renderer.h"
#include "renderer/Picker.h"

int add(int a, int b) { return a + b; }

scene::Scene sceneGraph;
scene::Camera camera;
renderer::Renderer rendererInstance;
scene::Node* selectedNode = nullptr;
int current_gizmo_mode = 1;

void set_gizmo_mode(int mode) {
    current_gizmo_mode = mode;
}

void init_renderer(int width, int height) {
    auto root = std::make_unique<scene::Node>("Root");
    
    auto cube = std::make_unique<scene::Node>("Cube");
    cube->meshType = scene::MeshType::Cube;
    cube->position = math::vec3(-1.5f, 0.5f, 0);
    
    auto sphere = std::make_unique<scene::Node>("Sphere");
    sphere->meshType = scene::MeshType::Sphere;
    sphere->position = math::vec3(1.5f, 0.5f, 0);
    
    auto plane = std::make_unique<scene::Node>("Plane");
    plane->meshType = scene::MeshType::Plane;
    plane->position = math::vec3(0, 0.5f, -2.0f);
    
    auto torus = std::make_unique<scene::Node>("Torus");
    torus->meshType = scene::MeshType::Torus;
    torus->position = math::vec3(0, 0.5f, 2.0f);
    
    root->addChild(std::move(cube));
    root->addChild(std::move(sphere));
    root->addChild(std::move(plane));
    root->addChild(std::move(torus));
    
    sceneGraph.root = std::move(root);

    camera.aspect = (float)width / (float)height;
    rendererInstance.init(sceneGraph, camera, width, height);
}

void resize_renderer(int width, int height) {
    camera.aspect = (float)width / (float)height;
    rendererInstance.resize(width, height);
}

void render_frame() {
    rendererInstance.render_frame(sceneGraph, camera, selectedNode, current_gizmo_mode);
}

// Camera manipulation bindings
void orbit_camera(float dx, float dy) { camera.orbit(dx, dy); }
void pan_camera(float dx, float dy) { camera.pan(dx, dy); }
void zoom_camera(float amount) { camera.zoom(amount); }

bool select_object_at(float x, float y, float width, float height) {
    return renderer::Picker::select_object_at(sceneGraph, camera, selectedNode, x, y, width, height);
}

int select_axis_at(float x, float y, float width, float height) {
    return renderer::Picker::select_axis_at(camera, selectedNode, x, y, width, height, current_gizmo_mode);
}

void drag_selected(float dx, float dy, int axis) {
    renderer::Picker::drag_selected(camera, selectedNode, dx, dy, axis, current_gizmo_mode);
}

// Embind
EMSCRIPTEN_BINDINGS(my_module) {
    emscripten::function("add", &add);
    emscripten::function("init_renderer", &init_renderer);
    emscripten::function("resize_renderer", &resize_renderer);
    emscripten::function("render_frame", &render_frame);
    emscripten::function("orbit_camera", &orbit_camera);
    emscripten::function("pan_camera", &pan_camera);
    emscripten::function("zoom_camera", &zoom_camera);
    emscripten::function("select_object_at", &select_object_at);
    emscripten::function("select_axis_at", &select_axis_at);
    emscripten::function("drag_selected", &drag_selected);
    emscripten::function("set_gizmo_mode", &set_gizmo_mode);
}

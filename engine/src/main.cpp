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

void init_renderer(int width, int height) {
    rendererInstance.init(sceneGraph, camera, width, height);
}

void resize_renderer(int width, int height) {
    rendererInstance.resize(width, height);
}

void render_frame() {
    rendererInstance.render_frame(sceneGraph, camera, selectedNode);
}

// Camera manipulation bindings
void orbit_camera(float dx, float dy) { camera.orbit(dx, dy); }
void pan_camera(float dx, float dy) { camera.pan(dx, dy); }
void zoom_camera(float amount) { camera.zoom(amount); }

bool select_object_at(float x, float y, float width, float height) {
    return renderer::Picker::select_object_at(sceneGraph, camera, selectedNode, x, y, width, height);
}

int select_axis_at(float x, float y, float width, float height) {
    return renderer::Picker::select_axis_at(camera, selectedNode, x, y, width, height);
}

void drag_selected(float dx, float dy, int axis) {
    renderer::Picker::drag_selected(camera, selectedNode, dx, dy, axis);
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
}

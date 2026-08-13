#include <emscripten/bind.h>
#include "scene/Scene.h"
#include "scene/Camera.h"
#include "renderer/Renderer.h"
#include "renderer/Picker.h"
#include <string>
#include <sstream>
#include <iomanip>
#include <cmath>

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
    cube->position = math::vec3(0, 0, 0);
    
    auto sphere = std::make_unique<scene::Node>("Sphere");
    sphere->meshType = scene::MeshType::Sphere;
    sphere->position = math::vec3(1.5f, 0.5f, 0);
    
    cube->addChild(std::move(sphere));
    root->addChild(std::move(cube));
    
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
std::string meshTypeToString(scene::MeshType type) {
    switch (type) {
        case scene::MeshType::Cube: return "Cube";
        case scene::MeshType::Sphere: return "Sphere";
        case scene::MeshType::Plane: return "Plane";
        case scene::MeshType::Torus: return "Torus";
        default: return "Empty";
    }
}

void serializeNode(std::ostringstream& json, scene::Node* node) {
    json << "{\"id\":" << node->id
         << ",\"name\":\"" << node->name << "\""
         << ",\"type\":\"" << meshTypeToString(node->meshType) << "\""
         << ",\"children\":[";
    for (size_t i = 0; i < node->children.size(); i++) {
        if (i > 0) json << ",";
        serializeNode(json, node->children[i].get());
    }
    json << "]}";
}

std::string get_scene_hierarchy() {
    std::ostringstream json;
    json << "[";
    auto& children = sceneGraph.root->children;
    for (size_t i = 0; i < children.size(); i++) {
        if (i > 0) json << ",";
        serializeNode(json, children[i].get());
    }
    json << "]";
    return json.str();
}

int get_selected_node_id() {
    return selectedNode ? selectedNode->id : -1;
}

std::string get_node_transform(int id) {
    auto* node = sceneGraph.findNodeById(id);
    if (!node) return "{}";
    auto euler = node->rotation.toEulerDegrees();
    std::ostringstream json;
    json << std::fixed << std::setprecision(4);
    json << "{\"position\":{\"x\":" << node->position.x
         << ",\"y\":" << node->position.y
         << ",\"z\":" << node->position.z << "}"
         << ",\"rotation\":{\"x\":" << euler.x
         << ",\"y\":" << euler.y
         << ",\"z\":" << euler.z << "}"
         << ",\"scale\":{\"x\":" << node->scale.x
         << ",\"y\":" << node->scale.y
         << ",\"z\":" << node->scale.z << "}}";
    return json.str();
}

void set_node_position(int id, float x, float y, float z) {
    auto* node = sceneGraph.findNodeById(id);
    if (!node) return;
    node->position = math::vec3(x, y, z);
    sceneGraph.update();
}

void set_node_rotation_euler(int id, float x, float y, float z) {
    auto* node = sceneGraph.findNodeById(id);
    if (!node) return;
    node->rotation = math::quat::fromEulerDegrees(x, y, z);
    sceneGraph.update();
}

void set_node_scale(int id, float x, float y, float z) {
    auto* node = sceneGraph.findNodeById(id);
    if (!node) return;
    node->scale = math::vec3(x, y, z);
    sceneGraph.update();
}

void select_node_by_id(int id) {
    selectedNode = sceneGraph.findNodeById(id);
}

void deselect_all() {
    selectedNode = nullptr;
}

int add_primitive_node(std::string type) {
    auto node = std::make_unique<scene::Node>(type);
    if (type == "Cube") node->meshType = scene::MeshType::Cube;
    else if (type == "Sphere") node->meshType = scene::MeshType::Sphere;
    else if (type == "Plane") node->meshType = scene::MeshType::Plane;
    else if (type == "Torus") node->meshType = scene::MeshType::Torus;
    node->position = math::vec3(0, 0.5f, 0);
    int newId = node->id;
    sceneGraph.root->addChild(std::move(node));
    sceneGraph.update();
    return newId;
}

bool delete_node_by_id(int id) {
    if (selectedNode && selectedNode->id == id) {
        selectedNode = nullptr;
    }
    bool result = sceneGraph.deleteNodeById(id);
    sceneGraph.update();
    return result;
}

int get_gizmo_mode() {
    return current_gizmo_mode;
}

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
    emscripten::function("get_scene_hierarchy", &get_scene_hierarchy);
    emscripten::function("get_selected_node_id", &get_selected_node_id);
    emscripten::function("get_node_transform", &get_node_transform);
    emscripten::function("set_node_position", &set_node_position);
    emscripten::function("set_node_rotation_euler", &set_node_rotation_euler);
    emscripten::function("set_node_scale", &set_node_scale);
    emscripten::function("select_node_by_id", &select_node_by_id);
    emscripten::function("deselect_all", &deselect_all);
    emscripten::function("add_primitive_node", &add_primitive_node);
    emscripten::function("delete_node_by_id", &delete_node_by_id);
    emscripten::function("get_gizmo_mode", &get_gizmo_mode);
}

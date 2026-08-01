#pragma once

#include "scene/Scene.h"
#include "scene/Camera.h"
#include "scene/Node.h"

namespace renderer {
    class Picker {
    public:
        static bool select_object_at(scene::Scene& scene, scene::Camera& camera, scene::Node*& selectedNode, float x, float y, float width, float height);
        static int select_axis_at(scene::Camera& camera, scene::Node* selectedNode, float x, float y, float width, float height);
        static void drag_selected(scene::Camera& camera, scene::Node* selectedNode, float dx, float dy, int axis);
    };
}

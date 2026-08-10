#pragma once

#include "math/vec3.h"
#include "math/quat.h"
#include "math/mat4.h"
#include <vector>
#include <memory>
#include <string>

#include "math/aabb.h"

namespace scene {

    enum class MeshType { None, Cube, Sphere, Plane, Torus };

    class Node {
    public:
        std::string name;
        MeshType meshType = MeshType::None;
        
        math::vec3 position;
        math::quat rotation;
        math::vec3 scale;

        Node* parent = nullptr;
        std::vector<std::unique_ptr<Node>> children;

        math::mat4 localTransform;
        math::mat4 worldTransform;
        math::aabb boundingBox;

        Node(const std::string& name = "Node") 
            : name(name), position(0, 0, 0), rotation(math::quat::identity()), scale(1, 1, 1), 
              localTransform(math::mat4::identity()), worldTransform(math::mat4::identity()),
              boundingBox(math::vec3(-0.5f, -0.5f, -0.5f), math::vec3(0.5f, 0.5f, 0.5f)) {}

        Node* addChild(std::unique_ptr<Node> child) {
            child->parent = this;
            Node* ptr = child.get();
            children.push_back(std::move(child));
            return ptr;
        }

        void updateTransforms() {
            // Local transform = Translation * Rotation * Scale
            math::mat4 t = math::mat4::translation(position);
            math::mat4 r = rotation.toMat4();
            math::mat4 s = math::mat4::scaling(scale);
            
            localTransform = t * r * s;

            if (parent) {
                worldTransform = parent->worldTransform * localTransform;
            } else {
                worldTransform = localTransform;
            }

            for (auto& child : children) {
                child->updateTransforms();
            }
        }
    };

}

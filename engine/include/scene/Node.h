#pragma once

#include "math/vec3.h"
#include "math/quat.h"
#include "math/mat4.h"
#include <vector>
#include <memory>
#include <string>

namespace scene {

    class Node {
    public:
        std::string name;
        
        math::vec3 position;
        math::quat rotation;
        math::vec3 scale;

        Node* parent = nullptr;
        std::vector<std::unique_ptr<Node>> children;

        math::mat4 localTransform;
        math::mat4 worldTransform;

        Node(const std::string& name = "Node") 
            : name(name), position(0, 0, 0), rotation(math::quat::identity()), scale(1, 1, 1), 
              localTransform(math::mat4::identity()), worldTransform(math::mat4::identity()) {}

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

#pragma once

#include "Node.h"
#include <memory>
#include <vector>

namespace scene {

    class Scene {
    public:
        std::unique_ptr<Node> root;

        Scene() {
            root = std::make_unique<Node>("Root");
        }

        void update() {
            root->updateTransforms();
        }
        
        // A flattened list of nodes could be generated here for rendering,
        // but for now, we can just traverse the tree.
        void getRenderableNodes(Node* node, std::vector<Node*>& outNodes) {
            outNodes.push_back(node);
            for (auto& child : node->children) {
                getRenderableNodes(child.get(), outNodes);
            }
        }

        std::vector<Node*> getRenderList() {
            std::vector<Node*> list;
            getRenderableNodes(root.get(), list);
            return list;
        }
    };

}

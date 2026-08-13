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

        Node* findNodeById(int id) {
            return findNodeByIdRecursive(root.get(), id);
        }

    private:
        Node* findNodeByIdRecursive(Node* node, int id) {
            if (!node) return nullptr;
            if (node->id == id) return node;
            for (auto& child : node->children) {
                Node* found = findNodeByIdRecursive(child.get(), id);
                if (found) return found;
            }
            return nullptr;
        }

    public:
        bool deleteNodeById(int id) {
            return deleteNodeRecursive(root.get(), id);
        }

    private:
        bool deleteNodeRecursive(Node* parent, int id) {
            auto& ch = parent->children;
            for (auto it = ch.begin(); it != ch.end(); ++it) {
                if ((*it)->id == id) {
                    ch.erase(it);
                    return true;
                }
                if (deleteNodeRecursive(it->get(), id)) return true;
            }
            return false;
        }

    public:
        
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

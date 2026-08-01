#include "renderer/Picker.h"
#include "math/ray.h"
#include <cmath>

namespace renderer {

    bool Picker::select_object_at(scene::Scene& scene, scene::Camera& camera, scene::Node*& selectedNode, float x, float y, float width, float height) {
        float ndcX = (x / width) * 2.0f - 1.0f;
        float ndcY = 1.0f - (y / height) * 2.0f; // Y is down in screen space

        math::mat4 invProj = camera.getProjectionMatrix().inverse();
        math::vec4 clipCoords(ndcX, ndcY, 1.0f, 1.0f);
        math::vec4 eyeCoords = invProj * clipCoords;
        eyeCoords.z = -1.0f; 
        eyeCoords.w = 0.0f;

        math::mat4 invView = camera.getViewMatrix().inverse();
        math::vec4 worldCoords = invView * eyeCoords;
        math::vec3 rayDir = math::vec3(worldCoords.x, worldCoords.y, worldCoords.z).normalize();

        math::ray pickingRay(camera.position, rayDir);

        float closestT = 1e30f;
        scene::Node* hitNode = nullptr;

        auto nodes = scene.getRenderList();
        for (auto* node : nodes) {
            math::mat4 invModel = node->worldTransform.inverse();
            math::vec4 rayOriginObj = invModel * math::vec4(pickingRay.origin.x, pickingRay.origin.y, pickingRay.origin.z, 1.0f);
            math::vec4 rayDirObj = invModel * math::vec4(pickingRay.direction.x, pickingRay.direction.y, pickingRay.direction.z, 0.0f);
            
            math::ray localRay(
                math::vec3(rayOriginObj.x, rayOriginObj.y, rayOriginObj.z), 
                math::vec3(rayDirObj.x, rayDirObj.y, rayDirObj.z).normalize()
            );

            float t = 0;
            if (localRay.intersects(node->boundingBox, t)) {
                if (t < closestT) {
                    closestT = t;
                    hitNode = node;
                }
            }
        }

        selectedNode = hitNode;
        return selectedNode != nullptr;
    }

    int Picker::select_axis_at(scene::Camera& camera, scene::Node* selectedNode, float x, float y, float width, float height) {
        if (!selectedNode) return -1;
        
        float ndcX = (x / width) * 2.0f - 1.0f;
        float ndcY = 1.0f - (y / height) * 2.0f; 

        math::mat4 invProj = camera.getProjectionMatrix().inverse();
        math::vec4 clipCoords(ndcX, ndcY, 1.0f, 1.0f);
        math::vec4 eyeCoords = invProj * clipCoords;
        eyeCoords.z = -1.0f; 
        eyeCoords.w = 0.0f;

        math::mat4 invView = camera.getViewMatrix().inverse();
        math::vec4 worldCoords = invView * eyeCoords;
        math::vec3 rayDir = math::vec3(worldCoords.x, worldCoords.y, worldCoords.z).normalize();

        math::ray pickingRay(camera.position, rayDir);
        math::vec3 pos = selectedNode->worldTransform * math::vec3(0, 0, 0);

        math::aabb xBox(pos + math::vec3(0, -0.1f, -0.1f), pos + math::vec3(2.0f, 0.1f, 0.1f));
        math::aabb yBox(pos + math::vec3(-0.1f, 0, -0.1f), pos + math::vec3(0.1f, 2.0f, 0.1f));
        math::aabb zBox(pos + math::vec3(-0.1f, -0.1f, 0), pos + math::vec3(0.1f, 0.1f, 2.0f));

        float t;
        if (pickingRay.intersects(xBox, t)) return 0;
        if (pickingRay.intersects(yBox, t)) return 1;
        if (pickingRay.intersects(zBox, t)) return 2;

        return -1;
    }

    void Picker::drag_selected(scene::Camera& camera, scene::Node* selectedNode, float dx, float dy, int axis) {
        if (!selectedNode) return;

        math::vec3 axisVec(0, 0, 0);
        if (axis == 0) axisVec.x = 1.0f;
        if (axis == 1) axisVec.y = 1.0f;
        if (axis == 2) axisVec.z = 1.0f;

        math::mat4 viewProj = camera.getProjectionMatrix() * camera.getViewMatrix();
        math::vec3 a_ndc = viewProj * selectedNode->position;
        math::vec3 b_ndc = viewProj * (selectedNode->position + axisVec);

        float sx = b_ndc.x - a_ndc.x;
        float sy = -(b_ndc.y - a_ndc.y); // Negate Y because screen Y increases downwards

        float len = std::sqrt(sx * sx + sy * sy);
        if (len < 0.0001f) return;
        sx /= len;
        sy /= len;

        float delta = (dx * sx + dy * sy) * 0.01f;
        if (axis == 0) selectedNode->position.x += delta;
        if (axis == 1) selectedNode->position.y += delta;
        if (axis == 2) selectedNode->position.z += delta;

        selectedNode->localTransform = math::mat4::translation(selectedNode->position);
    }
}

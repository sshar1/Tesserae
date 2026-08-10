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
            if (node->meshType == scene::MeshType::None) continue;
            
            math::mat4 invModel = node->worldTransform.inverse();
            math::vec4 rayOriginObj = invModel * math::vec4(pickingRay.origin.x, pickingRay.origin.y, pickingRay.origin.z, 1.0f);
            math::vec4 rayDirObj = invModel * math::vec4(pickingRay.direction.x, pickingRay.direction.y, pickingRay.direction.z, 0.0f);
            
            math::ray localRay(
                math::vec3(rayOriginObj.x, rayOriginObj.y, rayOriginObj.z), 
                math::vec3(rayDirObj.x, rayDirObj.y, rayDirObj.z).normalize()
            );

            float t = 1e30f;
            bool hit = false;
            
            if (node->meshType == scene::MeshType::Cube) {
                hit = localRay.intersects(math::aabb(math::vec3(-0.5f, -0.5f, -0.5f), math::vec3(0.5f, 0.5f, 0.5f)), t);
            } else if (node->meshType == scene::MeshType::Sphere) {
                float radius = 0.5f;
                float a = math::vec3::dot(localRay.direction, localRay.direction);
                float b = 2.0f * math::vec3::dot(localRay.direction, localRay.origin);
                float c = math::vec3::dot(localRay.origin, localRay.origin) - radius * radius;
                float discriminant = b * b - 4.0f * a * c;
                if (discriminant >= 0) {
                    float t1 = (-b - std::sqrt(discriminant)) / (2.0f * a);
                    if (t1 > 0) {
                        t = t1;
                        hit = true;
                    }
                }
            } else if (node->meshType == scene::MeshType::Plane) {
                hit = localRay.intersects(math::aabb(math::vec3(-2.5f, -0.05f, -2.5f), math::vec3(2.5f, 0.05f, 2.5f)), t);
            } else if (node->meshType == scene::MeshType::Torus) {
                hit = localRay.intersects(math::aabb(math::vec3(-1.05f, -0.05f, -1.05f), math::vec3(1.05f, 0.05f, 1.05f)), t);
            }

            if (hit && t < closestT) {
                closestT = t;
                hitNode = node;
            }
        }

        selectedNode = hitNode;
        return selectedNode != nullptr;
    }

    int Picker::select_axis_at(scene::Camera& camera, scene::Node* selectedNode, float x, float y, float width, float height, int gizmoMode) {
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

        math::aabb xBox(pos, pos);
        math::aabb yBox(pos, pos);
        math::aabb zBox(pos, pos);

        float dist = (camera.position - pos).length();
        float scale = dist * 0.15f; 

        if (gizmoMode == 1) { // Translate (Arrows)
            xBox = math::aabb(pos + math::vec3(0, -scale*0.1f, -scale*0.1f), pos + math::vec3(scale, scale*0.1f, scale*0.1f));
            yBox = math::aabb(pos + math::vec3(-scale*0.1f, 0, -scale*0.1f), pos + math::vec3(scale*0.1f, scale, scale*0.1f));
            zBox = math::aabb(pos + math::vec3(-scale*0.1f, -scale*0.1f, 0), pos + math::vec3(scale*0.1f, scale*0.1f, scale));
        } else if (gizmoMode == 2) { // Rotate (Rings)
            // Rings go from -scale to +scale. Use flat boxes
            xBox = math::aabb(pos + math::vec3(-scale*0.1f, -scale, -scale), pos + math::vec3(scale*0.1f, scale, scale));
            yBox = math::aabb(pos + math::vec3(-scale, -scale*0.1f, -scale), pos + math::vec3(scale, scale*0.1f, scale));
            zBox = math::aabb(pos + math::vec3(-scale, -scale, -scale*0.1f), pos + math::vec3(scale, scale, scale*0.1f));
        } else if (gizmoMode == 3) { // Scale (Spheres at end)
            float offset = 1.0f + selectedNode->scale.length() * 0.5f; 
            xBox = math::aabb(pos + math::vec3(offset - scale*0.2f, -scale*0.2f, -scale*0.2f), pos + math::vec3(offset + scale*0.2f, scale*0.2f, scale*0.2f));
            yBox = math::aabb(pos + math::vec3(-scale*0.2f, offset - scale*0.2f, -scale*0.2f), pos + math::vec3(scale*0.2f, offset + scale*0.2f, scale*0.2f));
            zBox = math::aabb(pos + math::vec3(-scale*0.2f, -scale*0.2f, offset - scale*0.2f), pos + math::vec3(scale*0.2f, scale*0.2f, offset + scale*0.2f));
        }

        float t;
        // Check intersections, pick the closest one
        int hit = -1;
        float closestT = 1e30f;
        
        if (pickingRay.intersects(xBox, t) && t < closestT) { closestT = t; hit = 0; }
        if (pickingRay.intersects(yBox, t) && t < closestT) { closestT = t; hit = 1; }
        if (pickingRay.intersects(zBox, t) && t < closestT) { closestT = t; hit = 2; }

        return hit;
    }

    void Picker::drag_selected(scene::Camera& camera, scene::Node* selectedNode, float dx, float dy, int axis, int gizmoMode) {
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
        
        if (gizmoMode == 1) { // Translate
            if (axis == 0) selectedNode->position.x += delta;
            if (axis == 1) selectedNode->position.y += delta;
            if (axis == 2) selectedNode->position.z += delta;
        } else if (gizmoMode == 2) { // Rotate
            math::quat rot = math::quat::fromAxisAngle(axisVec, delta * 3.0f);
            selectedNode->rotation = rot * selectedNode->rotation;
        } else if (gizmoMode == 3) { // Scale
            if (axis == 0) selectedNode->scale.x += delta;
            if (axis == 1) selectedNode->scale.y += delta;
            if (axis == 2) selectedNode->scale.z += delta;
            
            // Prevent negative or zero scale
            if (selectedNode->scale.x < 0.01f) selectedNode->scale.x = 0.01f;
            if (selectedNode->scale.y < 0.01f) selectedNode->scale.y = 0.01f;
            if (selectedNode->scale.z < 0.01f) selectedNode->scale.z = 0.01f;
        }

        selectedNode->updateTransforms();
    }
}

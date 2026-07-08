#pragma once

#include "math/vec3.h"
#include "math/quat.h"

namespace scene {

    class Camera {
    public:
        math::vec3 position;
        math::vec3 target;
        math::vec3 up;

        float fovY;
        float aspect;
        float zNear;
        float zFar;

        Camera() 
            : position(0, 0, 5), target(0, 0, 0), up(0, 1, 0), 
              fovY(3.14159f / 4.0f), aspect(800.0f / 600.0f), zNear(0.1f), zFar(100.0f) {}

        math::mat4 getViewMatrix() const {
            return math::mat4::lookAt(position, target, up);
        }

        math::mat4 getProjectionMatrix() const {
            return math::mat4::perspective(fovY, aspect, zNear, zFar);
        }

        void orbit(float dx, float dy) {
            // Simple orbit around target
            math::vec3 dir = (position - target).normalize();
            float radius = (position - target).length();

            // Right vector
            math::vec3 right = math::vec3::cross(up, dir).normalize();

            math::quat qY = math::quat::fromAxisAngle(up, -dx);
            math::quat qX = math::quat::fromAxisAngle(right, -dy);
            
            math::vec3 newDir = (qY * qX).toMat4() * dir; 
            
            position = target + newDir.normalize() * radius;
        }

        void zoom(float amount) {
            math::vec3 dir = (position - target).normalize();
            float radius = (position - target).length();
            radius -= amount;
            if (radius < 0.1f) radius = 0.1f;
            position = target + dir * radius;
        }

        void pan(float dx, float dy) {
            math::vec3 dir = (position - target).normalize();
            math::vec3 right = math::vec3::cross(up, dir).normalize();
            math::vec3 upDir = math::vec3::cross(dir, right).normalize();

            math::vec3 movement = right * -dx + upDir * dy;
            position += movement;
            target += movement;
        }
    };

}

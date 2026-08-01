#pragma once

#include "vec3.h"
#include "aabb.h"
#include <algorithm>

namespace math {
    struct ray {
        vec3 origin;
        vec3 direction; // Should be normalized

        ray() {}
        ray(const vec3& origin, const vec3& direction) : origin(origin), direction(direction) {}

        vec3 at(float t) const {
            return origin + direction * t;
        }

        bool intersects(const aabb& box, float& t) const {
            vec3 invDir(1.0f / direction.x, 1.0f / direction.y, 1.0f / direction.z);
            vec3 t0 = (box.min - origin) * invDir;
            vec3 t1 = (box.max - origin) * invDir;

            vec3 tmin(std::min(t0.x, t1.x), std::min(t0.y, t1.y), std::min(t0.z, t1.z));
            vec3 tmax(std::max(t0.x, t1.x), std::max(t0.y, t1.y), std::max(t0.z, t1.z));

            float tmin_final = std::max(std::max(tmin.x, tmin.y), tmin.z);
            float tmax_final = std::min(std::min(tmax.x, tmax.y), tmax.z);

            if (tmax_final >= tmin_final && tmax_final > 0.0f) {
                t = tmin_final > 0.0f ? tmin_final : tmax_final;
                return true;
            }
            return false;
        }

        bool intersectsTriangle(const vec3& v0, const vec3& v1, const vec3& v2, float& t, float& u, float& v) const {
            // Möller–Trumbore intersection algorithm
            vec3 edge1 = v1 - v0;
            vec3 edge2 = v2 - v0;
            vec3 h = vec3::cross(direction, edge2);
            float a = vec3::dot(edge1, h);

            if (a > -0.00001f && a < 0.00001f)
                return false;    // Ray is parallel to this triangle.

            float f = 1.0f / a;
            vec3 s = origin - v0;
            u = f * vec3::dot(s, h);

            if (u < 0.0f || u > 1.0f)
                return false;

            vec3 q = vec3::cross(s, edge1);
            v = f * vec3::dot(direction, q);

            if (v < 0.0f || u + v > 1.0f)
                return false;

            t = f * vec3::dot(edge2, q);
            return t > 0.00001f;
        }
    };
}

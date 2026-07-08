#pragma once

#include "vec3.h"
#include <algorithm>

namespace math {
    struct aabb {
        vec3 min;
        vec3 max;

        aabb() : min(vec3(1e30f, 1e30f, 1e30f)), max(vec3(-1e30f, -1e30f, -1e30f)) {}
        aabb(const vec3& min, const vec3& max) : min(min), max(max) {}

        void expand(const vec3& point) {
            min.x = std::min(min.x, point.x);
            min.y = std::min(min.y, point.y);
            min.z = std::min(min.z, point.z);
            
            max.x = std::max(max.x, point.x);
            max.y = std::max(max.y, point.y);
            max.z = std::max(max.z, point.z);
        }

        void expand(const aabb& other) {
            expand(other.min);
            expand(other.max);
        }
    };
}

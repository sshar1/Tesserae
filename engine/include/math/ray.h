#pragma once

#include "vec3.h"

namespace math {
    struct ray {
        vec3 origin;
        vec3 direction; // Should be normalized

        ray() {}
        ray(const vec3& origin, const vec3& direction) : origin(origin), direction(direction) {}

        vec3 at(float t) const {
            return origin + direction * t;
        }
    };
}

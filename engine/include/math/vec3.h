#pragma once

namespace math {
    struct vec3 {
        float x, y, z;

        vec3() : x(0), y(0), z(0) {}
        vec3(float x, float y, float z) : x(x), y(y), z(z) {}

        vec3 operator+(const vec3& other) const {
            return vec3(x + other.x, y + other.y, z + other.z);
        }

        vec3 operator*(float scalar) const {
            return vec3(x * scalar, y * scalar, z * scalar);
        }
    };
}

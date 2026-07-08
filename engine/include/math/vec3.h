#pragma once

#include <cmath>

namespace math {
    struct vec3 {
        float x, y, z;

        vec3() : x(0), y(0), z(0) {}
        vec3(float x, float y, float z) : x(x), y(y), z(z) {}

        vec3 operator+(const vec3& other) const { return vec3(x + other.x, y + other.y, z + other.z); }
        vec3 operator-(const vec3& other) const { return vec3(x - other.x, y - other.y, z - other.z); }
        vec3 operator*(float scalar) const { return vec3(x * scalar, y * scalar, z * scalar); }
        vec3 operator/(float scalar) const { return vec3(x / scalar, y / scalar, z / scalar); }
        
        vec3 operator-() const { return vec3(-x, -y, -z); }

        vec3& operator+=(const vec3& other) { x += other.x; y += other.y; z += other.z; return *this; }
        vec3& operator-=(const vec3& other) { x -= other.x; y -= other.y; z -= other.z; return *this; }
        vec3& operator*=(float scalar) { x *= scalar; y *= scalar; z *= scalar; return *this; }

        float lengthSq() const { return x*x + y*y + z*z; }
        float length() const { return std::sqrt(lengthSq()); }

        vec3 normalize() const {
            float len = length();
            if (len > 0.00001f) {
                return *this / len;
            }
            return vec3(0, 0, 0);
        }

        static float dot(const vec3& a, const vec3& b) {
            return a.x * b.x + a.y * b.y + a.z * b.z;
        }

        static vec3 cross(const vec3& a, const vec3& b) {
            return vec3(
                a.y * b.z - a.z * b.y,
                a.z * b.x - a.x * b.z,
                a.x * b.y - a.y * b.x
            );
        }
    };
}

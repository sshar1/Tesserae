#include <iostream>
#include <cmath>
#include "math/vec3.h"
#include "math/mat4.h"
#include "math/quat.h"
#include "math/ray.h"
#include "math/aabb.h"

bool approxEqual(float a, float b, float epsilon = 0.0001f) {
    return std::abs(a - b) < epsilon;
}

int main() {
    // vec3 tests
    math::vec3 a(1.0f, 2.0f, 3.0f);
    math::vec3 b(4.0f, 5.0f, 6.0f);
    math::vec3 c = a + b;
    if (c.x != 5.0f || c.y != 7.0f || c.z != 9.0f) {
        std::cerr << "vec3 addition failed!" << std::endl;
        return 1;
    }
    if (!approxEqual(math::vec3::dot(a, b), 32.0f)) {
        std::cerr << "vec3 dot failed!" << std::endl;
        return 1;
    }

    // mat4 tests
    math::mat4 id = math::mat4::identity();
    if (id.m[0] != 1.0f || id.m[5] != 1.0f || id.m[10] != 1.0f || id.m[15] != 1.0f) {
        std::cerr << "mat4 identity failed!" << std::endl;
        return 1;
    }
    
    math::mat4 trans = math::mat4::translation(math::vec3(1, 2, 3));
    if (trans.m[12] != 1.0f || trans.m[13] != 2.0f || trans.m[14] != 3.0f) {
        std::cerr << "mat4 translation failed!" << std::endl;
        return 1;
    }

    // quat tests
    math::quat q = math::quat::fromAxisAngle(math::vec3(0, 1, 0), 3.14159f * 0.5f); // 90 deg Y
    if (!approxEqual(q.y, 0.7071f) || !approxEqual(q.w, 0.7071f)) {
        std::cerr << "quat fromAxisAngle failed!" << std::endl;
        return 1;
    }

    // ray and aabb tests
    math::ray r(math::vec3(0, 0, 0), math::vec3(1, 0, 0));
    if (r.at(5.0f).x != 5.0f) {
        std::cerr << "ray at failed!" << std::endl;
        return 1;
    }

    math::aabb box(math::vec3(-1, -1, -1), math::vec3(1, 1, 1));
    box.expand(math::vec3(2, 2, 2));
    if (box.max.x != 2.0f) {
        std::cerr << "aabb expand failed!" << std::endl;
        return 1;
    }

    std::cout << "Math tests passed!" << std::endl;
    return 0;
}

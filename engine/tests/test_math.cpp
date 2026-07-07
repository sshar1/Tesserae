#include <iostream>
#include "math/vec3.h"
#include "math/mat4.h"

int main() {
    math::vec3 a(1.0f, 2.0f, 3.0f);
    math::vec3 b(4.0f, 5.0f, 6.0f);
    math::vec3 c = a + b;

    if (c.x != 5.0f || c.y != 7.0f || c.z != 9.0f) {
        std::cerr << "vec3 addition failed!" << std::endl;
        return 1;
    }

    math::mat4 id = math::mat4::identity();
    if (id.m[0] != 1.0f || id.m[5] != 1.0f || id.m[10] != 1.0f || id.m[15] != 1.0f) {
        std::cerr << "mat4 identity failed!" << std::endl;
        return 1;
    }

    std::cout << "Math tests passed!" << std::endl;
    return 0;
}

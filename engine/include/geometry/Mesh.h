#pragma once

#include "math/vec3.h"
#include <vector>
#include <cstdint>

namespace geometry {

    struct Vertex {
        math::vec3 position;
        math::vec3 normal;
        float u, v;
    };

    struct Mesh {
        std::vector<Vertex> vertices;
        std::vector<uint32_t> indices;
    };

}

#pragma once

#include <string>

namespace renderer {
    class ShaderLoader {
    public:
        static std::string load(const std::string& filepath);
    };
}

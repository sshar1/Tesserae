cmake_minimum_required(VERSION 3.16)
project(TesseraeEngine)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

include_directories(include)

if (EMSCRIPTEN)
    file(GLOB_RECURSE ENGINE_SOURCES src/*.cpp)
    add_executable(engine ${ENGINE_SOURCES})
    target_compile_options(engine PRIVATE --use-port=emdawnwebgpu -g)
    target_link_options(engine PRIVATE --use-port=emdawnwebgpu --bind "-sWASM=1" "-sMODULARIZE=1" "-sEXPORT_NAME=Module" "--embed-file=${CMAKE_CURRENT_SOURCE_DIR}/shaders@/shaders" -g -gseparate-dwarf)
    set_target_properties(engine PROPERTIES SUFFIX ".js")
    
    # Output to the frontend/public directory
    set_target_properties(engine PROPERTIES RUNTIME_OUTPUT_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/../frontend/public)
else()
    # Native build for testing
    add_executable(test_math tests/test_math.cpp)
endif()

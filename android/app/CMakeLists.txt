cmake_minimum_required(VERSION 3.18.1)
project(yakyn)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_library(native-lib SHARED src/main/cpp/native-lib.cpp)

# nodejs-mobile başlıkları ve kütüphanesi (CI'da libnode/ altına indirilir)
include_directories(${CMAKE_SOURCE_DIR}/libnode/include/node)

add_library(libnode SHARED IMPORTED)
set_target_properties(libnode PROPERTIES IMPORTED_LOCATION ${CMAKE_SOURCE_DIR}/libnode/bin/${ANDROID_ABI}/libnode.so)

find_library(log-lib log)
target_link_libraries(native-lib libnode ${log-lib})

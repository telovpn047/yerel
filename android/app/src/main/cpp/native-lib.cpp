// Gömülü Node.js'i başlatan JNI köprüsü (nodejs-mobile örneğine dayanır).
#include <jni.h>
#include <string>
#include <cstring>
#include <cstdlib>
#include <pthread.h>
#include <unistd.h>
#include <android/log.h>
#include "node.h"

static int pipe_stdout[2];
static int pipe_stderr[2];
static pthread_t thread_stdout;
static pthread_t thread_stderr;
static const char *TAG = "YAKYN-NODE";

static void *log_loop(void *arg) {
    int fd = *(int *) arg;
    int prio = (fd == pipe_stdout[0]) ? ANDROID_LOG_INFO : ANDROID_LOG_ERROR;
    char buf[2048];
    ssize_t n;
    while ((n = read(fd, buf, sizeof buf - 1)) > 0) {
        if (buf[n - 1] == '\n') --n;
        buf[n] = 0;
        __android_log_write(prio, TAG, buf);
    }
    return nullptr;
}

static int redirect_std() {
    setvbuf(stdout, nullptr, _IONBF, 0);
    setvbuf(stderr, nullptr, _IONBF, 0);
    if (pipe(pipe_stdout) == -1 || pipe(pipe_stderr) == -1) return -1;
    dup2(pipe_stdout[1], STDOUT_FILENO);
    dup2(pipe_stderr[1], STDERR_FILENO);
    if (pthread_create(&thread_stdout, nullptr, log_loop, &pipe_stdout[0]) == -1) return -1;
    if (pthread_create(&thread_stderr, nullptr, log_loop, &pipe_stderr[0]) == -1) return -1;
    pthread_detach(thread_stdout);
    pthread_detach(thread_stderr);
    return 0;
}

extern "C" JNIEXPORT jint JNICALL
Java_com_yakyn_app_NodeService_startNodeWithArguments(JNIEnv *env, jobject /* this */, jobjectArray arguments) {
    jsize argc = env->GetArrayLength(arguments);
    size_t total = 0;
    for (int i = 0; i < argc; i++) {
        auto s = (jstring) env->GetObjectArrayElement(arguments, i);
        const char *c = env->GetStringUTFChars(s, nullptr);
        total += strlen(c) + 1;
        env->ReleaseStringUTFChars(s, c);
    }
    // Node argv'nin bitişik bellekte olmasını bekler
    char *buffer = (char *) calloc(total, sizeof(char));
    char **argv = (char **) calloc(argc + 1, sizeof(char *));
    char *cur = buffer;
    for (int i = 0; i < argc; i++) {
        auto s = (jstring) env->GetObjectArrayElement(arguments, i);
        const char *c = env->GetStringUTFChars(s, nullptr);
        size_t l = strlen(c);
        memcpy(cur, c, l);
        argv[i] = cur;
        cur += l + 1;
        env->ReleaseStringUTFChars(s, c);
    }
    if (redirect_std() == -1) __android_log_write(ANDROID_LOG_ERROR, TAG, "stdout yönlendirilemedi");
    return jint(node::Start(argc, argv));
}

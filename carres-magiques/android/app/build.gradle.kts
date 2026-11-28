plugins {
    id("com.android.application")
}

android {
    namespace = "com.carresmagiques.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.carresmagiques.app"
        minSdk = 21
        targetSdk = 34
        versionCode = 19
        versionName = "2.9.0"
    }
    buildTypes {
        release { isMinifyEnabled = false }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    sourceSets {
        // l'application web est partagée avec la version PWA
        getByName("main").assets.srcDirs("../../web")
    }
}

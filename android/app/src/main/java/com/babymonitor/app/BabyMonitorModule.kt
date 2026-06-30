package com.babymonitor.app

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class BabyMonitorModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "BabyMonitor"

    @ReactMethod
    fun startService() {
        val intent = Intent(reactApplicationContext, BabyMonitorForegroundService::class.java).apply {
            action = BabyMonitorForegroundService.ACTION_START
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            reactApplicationContext.startForegroundService(intent)
        } else {
            reactApplicationContext.startService(intent)
        }
    }

    @ReactMethod
    fun stopService() {
        val intent = Intent(reactApplicationContext, BabyMonitorForegroundService::class.java).apply {
            action = BabyMonitorForegroundService.ACTION_STOP
        }
        reactApplicationContext.startService(intent)
    }
}

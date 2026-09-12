package com.siriustemp

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = "DeviceDiscoveryModule")
class DeviceDiscoveryModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private val TAG = "SiriusDiscovery"
    private val nsdManager = reactContext.getSystemService(Context.NSD_SERVICE) as NsdManager
    private var discoveryListener: NsdManager.DiscoveryListener? = null

    override fun getName(): String = "DeviceDiscoveryModule"

    @ReactMethod
    fun discoverDevice(serviceType: String, promise: Promise) {
        Log.d(TAG, "Starting NSD discovery for service: $serviceType")

        discoveryListener = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(regType: String) {
                Log.d(TAG, "NSD discovery started for $regType")
            }

            override fun onServiceFound(service: NsdServiceInfo) {
                Log.d(TAG, "NSD service found: ${service.serviceName}")
                if (service.serviceName == "aion-prototype" || service.serviceName == "aion-prototype._http._tcp") {
                    Log.d(TAG, "Target device found! Resolving...")
                    resolveService(service, promise)
                }
            }

            override fun onServiceLost(service: NsdServiceInfo) {
                Log.d(TAG, "NSD service lost: ${service.serviceName}")
            }

            override fun onDiscoveryStopped(regType: String) {
                Log.d(TAG, "NSD discovery stopped for $regType")
            }

            override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
                Log.e(TAG, "NSD discovery failed: $errorCode")
                Handler(Looper.getMainLooper()).post {
                    promise.reject("DISCOVERY_FAILED", "Error code: $errorCode")
                }
            }

            override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {
                Log.e(TAG, "NSD stop discovery failed: $errorCode")
            }
        }

        try {
            nsdManager.discoverServices(serviceType, NsdManager.PROTOCOL_DNS_SD, discoveryListener)
        } catch (e: Exception) {
            Log.e(TAG, "Exception during discovery start: ${e.message}")
            promise.reject("DISCOVERY_EXCEPTION", e.message)
        }
    }

    private fun resolveService(service: NsdServiceInfo, promise: Promise) {
        nsdManager.resolveService(service, object : NsdManager.ResolveListener {
            override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
                Log.e(TAG, "NSD resolve failed for ${serviceInfo.serviceName}: $errorCode")
                Handler(Looper.getMainLooper()).post {
                    promise.reject("RESOLVE_FAILED", "Error code: $errorCode")
                }
            }

            override fun onServiceResolved(serviceInfo: NsdServiceInfo) {
                Log.d(TAG, "NSD resolved: ${serviceInfo.serviceName} -> ${serviceInfo.host.hostAddress}:${serviceInfo.port}")

                try {
                    nsdManager.stopServiceDiscovery(discoveryListener)
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to stop discovery: ${e.message}")
                }

                Handler(Looper.getMainLooper()).post {
                    val map = Arguments.createMap()
                    map.putString("host", serviceInfo.host.hostAddress)
                    map.putInt("port", serviceInfo.port)
                    promise.resolve(map)
                }
            }
        })
    }

    @ReactMethod
    fun stopDiscovery() {
        try {
            discoveryListener?.let {
                nsdManager.stopServiceDiscovery(it)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Stop discovery failed: ${e.message}")
        }
    }
}

package com.siriustemp

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.wifi.WifiManager
import android.net.wifi.WifiNetworkSpecifier
import android.net.wifi.ScanResult
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule


@ReactModule(name = "WifiProvisioningModule")
class WifiProvisioningModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private val TAG = "SiriusWifiProv"
    private var currentNetwork: Network? = null
    private val connectivityManager = reactApplicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    override fun getName(): String = "WifiProvisioningModule"

    @ReactMethod
    fun discoverSoftAPs(promise: Promise) {
        try {
            Log.d(TAG, "Scanning for Sirius SoftAPs...")
            val wifiManager = reactApplicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager

            // Trigger a fresh scan. Note: startScan is throttled on Android 10+
            // but is still the only way to force a scan if the system hasn't done one.
            wifiManager.startScan()

            // Wait briefly for scan results to populate
            Handler(Looper.getMainLooper()).postDelayed({
                try {
                    val scanResults = wifiManager.scanResults
                    val siriusSsids = mutableSetOf<String>()
                    val pattern = Regex("^Sirius_[A-Za-z0-9:_-]+$")

                    for (result in scanResults) {
                        val ssid = result.SSID
                        if (ssid != null && pattern.matches(ssid)) {
                            siriusSsids.add(ssid)
                        }
                    }

                    Log.d(TAG, "Found ${siriusSsids.size} Sirius SoftAPs: ${siriusSsids.joinToString(", ")}")
                    promise.resolve(Arguments.fromList(siriusSsids.toList()))
                } catch (e: Exception) {
                    Log.e(TAG, "Error reading scan results: ${e.message}")
                    promise.reject("SCAN_ERROR", e.message)
                }
            }, 2000) // 2 second delay to allow scan results to arrive

        } catch (e: Exception) {
            Log.e(TAG, "discoverSoftAPs exception -> WIFI_ERROR: ${e.message}")
            promise.reject("WIFI_ERROR", e.message)
        }
    }

    @ReactMethod
    fun connectToSoftAP(ssid: String, pass: String, promise: Promise) {
        try {
            Log.d(TAG, "Initiating SoftAP connection to: $ssid")
            val specifier = WifiNetworkSpecifier.Builder()
                .setSsid(ssid)
                .setWpa2Passphrase(pass)
                .build()

            val request = NetworkRequest.Builder()
                .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
                .setNetworkSpecifier(specifier)
                .build()

            connectivityManager.requestNetwork(request, object : ConnectivityManager.NetworkCallback() {
                override fun onAvailable(network: Network) {
                    super.onAvailable(network)
                    Log.d(TAG, "NetworkCallback: onAvailable -> CONNECTED")
                    currentNetwork = network

                    try {
                        connectivityManager.bindProcessToNetwork(network)
                        Log.d(TAG, "Successfully bound process to network: $network")
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to bind process to network: ${e.message}")
                    }

                    Handler(Looper.getMainLooper()).post {
                        promise.resolve("connected")
                    }
                }

                override fun onUnavailable() {
                    super.onUnavailable()
                    Log.e(TAG, "NetworkCallback: onUnavailable -> CONNECTION_UNAVAILABLE")
                    Handler(Looper.getMainLooper()).post {
                        promise.reject("CONNECTION_UNAVAILABLE", "Unable to connect to SoftAP")
                    }
                }

                override fun onLost(network: Network) {
                    super.onLost(network)
                    Log.e(TAG, "NetworkCallback: onLost -> CONNECTION_LOST")
                    if (currentNetwork == network) {
                        currentNetwork = null
                        connectivityManager.bindProcessToNetwork(null)
                    }
                }
            })
        } catch (e: Exception) {
            Log.e(TAG, "connectToSoftAP exception -> WIFI_ERROR: ${e.message}")
            promise.reject("WIFI_ERROR", e.message)
        }
    }

    @ReactMethod
    fun disconnectFromSoftAP(promise: Promise) {
        try {
            Log.d(TAG, "Disconnecting from SoftAP...")
            connectivityManager.bindProcessToNetwork(null)
            currentNetwork = null
            promise.resolve("disconnected")
        } catch (e: Exception) {
            Log.e(TAG, "disconnectFromSoftAP exception -> WIFI_ERROR: ${e.message}")
            promise.reject("WIFI_ERROR", e.message)
        }
    }
}

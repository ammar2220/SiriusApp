package com.siriustemp

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.net.wifi.WifiNetworkSpecifier
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

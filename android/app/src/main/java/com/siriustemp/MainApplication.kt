package com.siriustemp

import android.app.Application
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeHost
import com.facebook.react.defaults.DefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactPackage
import com.facebook.react.PackageList

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost = object : DefaultReactNativeHost(this@MainApplication) {
    override fun getPackages(): List<ReactPackage> =
        PackageList(this@MainApplication).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here
          add(WifiProvisioningPackage())
          add(DeviceDiscoveryPackage())
        }

    override fun getJSMainModuleName(): String = "index"

    override fun getUseDeveloperSupport(): Boolean = true
  }

  override val reactHost: ReactHost
    get() = DefaultReactHost.getDefaultReactHost(this.applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}

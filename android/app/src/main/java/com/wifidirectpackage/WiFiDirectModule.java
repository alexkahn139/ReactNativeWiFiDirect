package com.wifidirectpackage;

import android.content.Context;
import android.net.wifi.p2p.WifiP2pManager;

import com.facebook.react.bridge.LifecycleEventListener;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

/**
 * Created by alexandre on 25/02/2018.
 * Based on https://github.com/winaacc/sport_native/
 */

public class WiFiDirectModule extends ReactContextBaseJavaModule implements LifecycleEventListener {

    public WifiP2pManager wifiP2pManager;
    public ReactApplicationContext context;

    @Override
    public String getName() {
        return "WiFiDirectModule";
    }

    public WiFiDirectModule(ReactApplicationContext reactContext){
        super(reactContext);
        context = reactContext;
        reactContext.addLifecycleEventListener(this);
        wifiP2pManager = (WifiP2pManager) reactContext.getSystemService(Context.WIFI_P2P_SERVICE);
    }


    @Override
    public void onHostResume() {

    }

    @Override
    public void onHostPause() {

    }

    @Override
    public void onHostDestroy() {

    }


}

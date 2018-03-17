package com.wifidirectpackage;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Created by alexandre on 25/02/2018.
 */

public class WiFiDirectModuleReactPackage implements ReactPackage{
    @Override
    public List<ViewManager> createViewManagers(ReactApplicationContext reactContext){
        return Collections.emptyList();
    }

    @Override
    public List<NativeModule> createNativeModules(ReactApplicationContext  reactContext){
        List<NativeModule> modules = new ArrayList<>();
        modules.add(new WiFiDirectModule(reactContext));
        return modules;
    }

}

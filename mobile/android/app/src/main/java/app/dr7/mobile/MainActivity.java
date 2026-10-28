package app.dr7.mobile;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // I plugin locali vanno registrati prima di super.onCreate().
        registerPlugin(DR7NavigationPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

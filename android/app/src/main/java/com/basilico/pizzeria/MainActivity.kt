package com.basilico.pizzeria

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.SharedPreferences
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.Window
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.JsPromptResult
import android.webkit.JsResult
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.Inet4Address
import java.net.InetSocketAddress
import java.net.NetworkInterface
import java.net.Socket
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

class MainActivity : Activity() {

    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private lateinit var errorLayout: LinearLayout
    private lateinit var errorSubtext: TextView
    private lateinit var scanButton: Button
    private lateinit var prefs: SharedPreferences

    private val PREFS_NAME = "BasilicoPosPrefs"
    private val KEY_SERVER_IP = "server_ip"
    private val DEFAULT_SERVER_IP = "192.168.1.10:3001"

    private var backPressedTime: Long = 0
    @Volatile
    private var isScanningNetwork = false

    inner class BasilicoBridge {
        @JavascriptInterface
        fun openIpConfig() {
            runOnUiThread {
                showServerConfigDialog()
            }
        }

        @JavascriptInterface
        fun getServerIp(): String {
            return getSavedServerIp()
        }

        @JavascriptInterface
        fun setServerIp(newIp: String) {
            val clean = normalizeIpWithPort(newIp)
            if (clean.isNotEmpty()) {
                prefs.edit().putString(KEY_SERVER_IP, clean).apply()
                runOnUiThread {
                    Toast.makeText(this@MainActivity, "Conectando a: $clean...", Toast.LENGTH_SHORT).show()
                    errorLayout.visibility = View.GONE
                    webView.visibility = View.VISIBLE
                    webView.clearCache(true)
                    loadMeseroUrl()
                }
            }
        }

        @JavascriptInterface
        fun scanNetwork() {
            runOnUiThread {
                scanNetworkForServer()
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        // Establecer pantalla completa y mantener pantalla encendida
        requestWindowFeature(Window.FEATURE_NO_TITLE)
        window.setFlags(
            WindowManager.LayoutParams.FLAG_FULLSCREEN,
            WindowManager.LayoutParams.FLAG_FULLSCREEN
        )
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        super.onCreate(savedInstanceState)

        prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

        // Contenedor principal
        val rootLayout = FrameLayout(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(Color.parseColor("#0f172a"))
        }

        // 1. Inicializar WebView
        webView = WebView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(Color.parseColor("#0f172a"))
            overScrollMode = View.OVER_SCROLL_NEVER
        }

        setupWebViewSettings()
        setupWebViewClients()
        // Limpiar caché de versiones anteriores para garantizar logo y bundle actualizados
        webView.clearCache(true)

        // 2. Barra de progreso superior discreta (color verde Basilico)
        progressBar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                8
            ).apply {
                gravity = Gravity.TOP
            }
            isIndeterminate = false
            max = 100
            progress = 0
            visibility = View.VISIBLE
        }

        // 3. Vista de error / servidor desconectado
        errorLayout = createErrorLayout()
        errorLayout.visibility = View.GONE

        // 4. Botón flotante discreto de configuración de IP (Esquina inferior izquierda para NO tapar botones de envío a la derecha)
        val configButton = Button(this).apply {
            text = "⚙️"
            textSize = 15f
            setPadding(0, 0, 0, 0)
            val sizePx = (38 * resources.displayMetrics.density).toInt()
            layoutParams = FrameLayout.LayoutParams(sizePx, sizePx).apply {
                gravity = Gravity.BOTTOM or Gravity.START
                setMargins((10 * resources.displayMetrics.density).toInt(), 0, 0, (10 * resources.displayMetrics.density).toInt())
            }
            val bg = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.argb(165, 15, 23, 42))
                setStroke((1.5 * resources.displayMetrics.density).toInt(), Color.argb(190, 34, 197, 94))
            }
            background = bg
            alpha = 0.50f
            setOnClickListener {
                showServerConfigDialog()
            }
        }

        // Ensamblar interfaz
        rootLayout.addView(webView)
        rootLayout.addView(progressBar)
        rootLayout.addView(errorLayout)
        rootLayout.addView(configButton)

        setContentView(rootLayout)

        // Cargar URL del mesonero
        loadMeseroUrl()
    }

    override fun onResume() {
        super.onResume()
        setImmersiveFullScreen()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) {
            setImmersiveFullScreen()
        }
    }

    /**
     * Mantiene la tablet/teléfono en modo kiosco inmersivo total
     */
    private fun setImmersiveFullScreen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_FULLSCREEN
            )
        }
    }

    private fun setupWebViewSettings() {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = true
            allowContentAccess = true
            loadWithOverviewMode = true
            useWideViewPort = true
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            mediaPlaybackRequiresUserGesture = false
            cacheMode = WebSettings.LOAD_DEFAULT
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
            }
            val originalUa = userAgentString
            userAgentString = "$originalUa BasilicoTablet/2.0 Kiosk"
        }
        webView.addJavascriptInterface(BasilicoBridge(), "BasilicoNative")
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null)
    }

    private fun setupWebViewClients() {
        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                if (newProgress < 100) {
                    progressBar.visibility = View.VISIBLE
                    progressBar.progress = newProgress
                } else {
                    progressBar.visibility = View.GONE
                }
            }

            override fun onJsAlert(view: WebView?, url: String?, message: String?, result: JsResult?): Boolean {
                AlertDialog.Builder(this@MainActivity)
                    .setTitle("Basilico POS")
                    .setMessage(message ?: "")
                    .setPositiveButton("Aceptar") { _, _ -> result?.confirm() }
                    .setCancelable(false)
                    .show()
                return true
            }

            override fun onJsConfirm(view: WebView?, url: String?, message: String?, result: JsResult?): Boolean {
                AlertDialog.Builder(this@MainActivity)
                    .setTitle("Confirmar Acción")
                    .setMessage(message ?: "")
                    .setPositiveButton("Aceptar") { _, _ -> result?.confirm() }
                    .setNegativeButton("Cancelar") { _, _ -> result?.cancel() }
                    .setCancelable(false)
                    .show()
                return true
            }

            override fun onJsPrompt(view: WebView?, url: String?, message: String?, defaultValue: String?, result: JsPromptResult?): Boolean {
                val input = EditText(this@MainActivity).apply {
                    setText(defaultValue ?: "")
                }
                AlertDialog.Builder(this@MainActivity)
                    .setTitle(message ?: "Ingresar dato")
                    .setView(input)
                    .setPositiveButton("Aceptar") { _, _ -> result?.confirm(input.text.toString()) }
                    .setNegativeButton("Cancelar") { _, _ -> result?.cancel() }
                    .setCancelable(false)
                    .show()
                return true
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                return false
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                errorLayout.visibility = View.GONE
                webView.visibility = View.VISIBLE
                setImmersiveFullScreen()
            }

            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                super.onReceivedError(view, request, error)
                if (request?.isForMainFrame == true) {
                    showErrorState()
                }
            }
        }
    }

    private fun createErrorLayout(): LinearLayout {
        val density = resources.displayMetrics.density
        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(Color.parseColor("#0f172a"))
            setPadding((28 * density).toInt(), (24 * density).toInt(), (28 * density).toInt(), (24 * density).toInt())

            val logoImage = ImageView(this@MainActivity).apply {
                val logoSize = (88 * density).toInt()
                layoutParams = LinearLayout.LayoutParams(logoSize, logoSize).apply {
                    bottomMargin = (12 * density).toInt()
                    gravity = Gravity.CENTER
                }
                setImageResource(R.drawable.basilico_logo)
                scaleType = ImageView.ScaleType.FIT_CENTER
            }

            val titleText = TextView(this@MainActivity).apply {
                text = "BASILICO POS"
                textSize = 26f
                setTextColor(Color.parseColor("#4ade80"))
                setTypeface(null, Typeface.BOLD)
                gravity = Gravity.CENTER
            }

            val alertText = TextView(this@MainActivity).apply {
                text = "⚠️ No se pudo conectar con la PC Servidor"
                textSize = 18f
                setTextColor(Color.WHITE)
                setTypeface(null, Typeface.BOLD)
                gravity = Gravity.CENTER
                setPadding(0, (12 * density).toInt(), 0, (6 * density).toInt())
            }

            errorSubtext = TextView(this@MainActivity).apply {
                text = "Verifica que el computador principal esté encendido y en la misma red Wi-Fi."
                textSize = 13f
                setTextColor(Color.parseColor("#cbd5e1"))
                gravity = Gravity.CENTER
                setPadding(0, 0, 0, (22 * density).toInt())
            }

            val retryButton = Button(this@MainActivity).apply {
                text = "🔄 REINTENTAR CONEXIÓN"
                textSize = 15f
                setTextColor(Color.BLACK)
                setTypeface(null, Typeface.BOLD)
                val bg = GradientDrawable().apply {
                    cornerRadius = 16 * density
                    setColor(Color.parseColor("#4ade80"))
                }
                background = bg
                setPadding((28 * density).toInt(), (14 * density).toInt(), (28 * density).toInt(), (14 * density).toInt())
                setOnClickListener {
                    errorLayout.visibility = View.GONE
                    webView.visibility = View.VISIBLE
                    loadMeseroUrl()
                }
            }

            scanButton = Button(this@MainActivity).apply {
                text = "🔍 BUSCAR PC AUTOMÁTICAMENTE EN WI-FI"
                textSize = 14f
                setTextColor(Color.BLACK)
                setTypeface(null, Typeface.BOLD)
                val bg = GradientDrawable().apply {
                    cornerRadius = 16 * density
                    setColor(Color.parseColor("#facc15"))
                }
                background = bg
                setPadding((24 * density).toInt(), (14 * density).toInt(), (24 * density).toInt(), (14 * density).toInt())
                layoutParams = LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                ).apply {
                    topMargin = (14 * density).toInt()
                }
                setOnClickListener {
                    scanNetworkForServer()
                }
            }

            val configIpButton = Button(this@MainActivity).apply {
                text = "⚙️ INGRESAR IP DEL SERVIDOR MANUALMENTE"
                textSize = 13f
                setTextColor(Color.WHITE)
                setTypeface(null, Typeface.BOLD)
                val bg = GradientDrawable().apply {
                    cornerRadius = 16 * density
                    setColor(Color.parseColor("#1e293b"))
                    setStroke((1.5 * density).toInt(), Color.parseColor("#475569"))
                }
                background = bg
                setPadding((24 * density).toInt(), (12 * density).toInt(), (24 * density).toInt(), (12 * density).toInt())
                layoutParams = LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                ).apply {
                    topMargin = (14 * density).toInt()
                }
                setOnClickListener {
                    showServerConfigDialog()
                }
            }

            addView(logoImage)
            addView(titleText)
            addView(alertText)
            addView(errorSubtext)
            addView(retryButton)
            addView(scanButton)
            addView(configIpButton)
        }
    }

    private fun showErrorState() {
        val currentIp = getSavedServerIp()
        val deviceIp = getDeviceWifiIp() ?: "No detectada"
        errorSubtext.text = "IP configurada actual: http://$currentIp/mesonero\nIP Wi-Fi de este dispositivo: $deviceIp\n\nSi la IP de la PC cambió en el router, toca 'Buscar PC Automáticamente' o ingresa la nueva IP manualmente."
        webView.visibility = View.GONE
        errorLayout.visibility = View.VISIBLE
    }

    private fun getSavedServerIp(): String {
        return prefs.getString(KEY_SERVER_IP, DEFAULT_SERVER_IP) ?: DEFAULT_SERVER_IP
    }

    private fun normalizeIpWithPort(ipOrHost: String): String {
        var clean = ipOrHost.trim()
        if (clean.isEmpty()) return ""
        if (clean.startsWith("http://") || clean.startsWith("https://")) {
            clean = clean.substringAfter("://")
        }
        if (clean.contains("/")) {
            clean = clean.substringBefore("/")
        }
        if (!clean.contains(":")) {
            clean = "$clean:3001"
        }
        return clean
    }

    private fun buildServerUrl(ipOrHost: String): String {
        val clean = normalizeIpWithPort(ipOrHost).ifEmpty { DEFAULT_SERVER_IP }
        return "http://$clean/mesonero"
    }

    private fun loadMeseroUrl() {
        val serverIp = getSavedServerIp()
        val targetUrl = buildServerUrl(serverIp)
        webView.loadUrl(targetUrl)
    }

    private fun getDeviceWifiIp(): String? {
        try {
            val interfaces = NetworkInterface.getNetworkInterfaces() ?: return null
            for (intf in interfaces) {
                if (!intf.isUp || intf.isLoopback) continue
                for (addr in intf.inetAddresses) {
                    if (!addr.isLoopbackAddress && addr is Inet4Address) {
                        val ip = addr.hostAddress ?: continue
                        if (ip.startsWith("192.168.") || ip.startsWith("10.") || ip.startsWith("172.")) {
                            return ip
                        }
                    }
                }
            }
        } catch (e: Exception) {
            // Ignorar
        }
        return null
    }

    private fun scanNetworkForServer() {
        if (isScanningNetwork) {
            Toast.makeText(this, "Buscando servidor en la red Wi-Fi...", Toast.LENGTH_SHORT).show()
            return
        }
        isScanningNetwork = true
        if (::scanButton.isInitialized) {
            scanButton.text = "⏳ BUSCANDO PC EN LA RED WI-FI..."
            scanButton.isEnabled = false
        }
        Toast.makeText(this, "🔍 Escaneando red local en busca del servidor Basilico...", Toast.LENGTH_SHORT).show()

        Thread {
            val prefixes = linkedSetOf<String>()
            val deviceIp = getDeviceWifiIp()
            if (deviceIp != null && deviceIp.count { it == '.' } == 3) {
                prefixes.add(deviceIp.substringBeforeLast(".") + ".")
            }
            val savedHost = normalizeIpWithPort(getSavedServerIp()).substringBefore(":")
            if (savedHost.count { it == '.' } == 3) {
                prefixes.add(savedHost.substringBeforeLast(".") + ".")
            }
            prefixes.add("192.168.10.")
            prefixes.add("192.168.0.")
            prefixes.add("192.168.1.")

            val foundIp = AtomicReference<String?>(null)

            for (prefix in prefixes) {
                if (foundIp.get() != null) break
                val pool = Executors.newFixedThreadPool(48)
                for (i in 1..254) {
                    val candidateIp = "$prefix$i"
                    pool.execute {
                        if (foundIp.get() != null) return@execute
                        try {
                            val sock = Socket()
                            sock.connect(InetSocketAddress(candidateIp, 3001), 420)
                            sock.close()

                            val url = URL("http://$candidateIp:3001/api/connection-info")
                            val conn = (url.openConnection() as HttpURLConnection).apply {
                                connectTimeout = 700
                                readTimeout = 700
                                requestMethod = "GET"
                            }
                            if (conn.responseCode == 200) {
                                val body = BufferedReader(InputStreamReader(conn.inputStream)).use { it.readText() }
                                if (body.contains("\"basilico\"") || body.contains("backendUrl")) {
                                    foundIp.compareAndSet(null, "$candidateIp:3001")
                                }
                            }
                            conn.disconnect()
                        } catch (_: Exception) {
                        }
                    }
                }
                pool.shutdown()
                try {
                    pool.awaitTermination(3500, TimeUnit.MILLISECONDS)
                } catch (_: Exception) {
                }
            }

            runOnUiThread {
                isScanningNetwork = false
                if (::scanButton.isInitialized) {
                    scanButton.text = "🔍 BUSCAR PC AUTOMÁTICAMENTE EN WI-FI"
                    scanButton.isEnabled = true
                }
                val result = foundIp.get()
                if (result != null) {
                    prefs.edit().putString(KEY_SERVER_IP, result).apply()
                    Toast.makeText(this@MainActivity, "✅ Servidor Basilico encontrado en $result", Toast.LENGTH_LONG).show()
                    errorLayout.visibility = View.GONE
                    webView.visibility = View.VISIBLE
                    webView.clearCache(true)
                    loadMeseroUrl()
                } else {
                    Toast.makeText(
                        this@MainActivity,
                        "⚠️ No se detectó la PC automáticamente. Verifica que el servidor esté abierto en la PC o ingresa la IP manualmente.",
                        Toast.LENGTH_LONG
                    ).show()
                }
            }
        }.start()
    }

    private fun showServerConfigDialog() {
        val currentIp = getSavedServerIp()
        val deviceIp = getDeviceWifiIp() ?: "No detectada"
        val density = resources.displayMetrics.density

        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding((24 * density).toInt(), (16 * density).toInt(), (24 * density).toInt(), (8 * density).toInt())
        }

        val infoLabel = TextView(this).apply {
            text = "IP actual del servidor: $currentIp\nIP Wi-Fi de este equipo: $deviceIp\n\nEscribe la nueva IP LAN de la PC (ej. 192.168.10.47 o 192.168.0.118):"
            textSize = 13f
            setTextColor(Color.parseColor("#334155"))
            setPadding(0, 0, 0, (12 * density).toInt())
        }

        val input = EditText(this).apply {
            setText(currentIp)
            setHint("Ej: 192.168.10.47:3001")
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            setPadding((16 * density).toInt(), (12 * density).toInt(), (16 * density).toInt(), (12 * density).toInt())
            setTextColor(Color.WHITE)
            setHintTextColor(Color.LTGRAY)
            setBackgroundColor(Color.parseColor("#0f172a"))
            setSelection(text.length)
        }

        val autoFindBtn = Button(this).apply {
            text = "🔍 Buscar PC Automáticamente en Red Wi-Fi"
            textSize = 12f
            setTextColor(Color.BLACK)
            setTypeface(null, Typeface.BOLD)
            val bg = GradientDrawable().apply {
                cornerRadius = 12 * density
                setColor(Color.parseColor("#facc15"))
            }
            background = bg
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply {
                topMargin = (12 * density).toInt()
            }
            setOnClickListener {
                scanNetworkForServer()
            }
        }

        layout.addView(infoLabel)
        layout.addView(input)
        layout.addView(autoFindBtn)

        val dialog = AlertDialog.Builder(this)
            .setTitle("📡 Configurar IP de la PC (Basilico)")
            .setView(layout)
            .setPositiveButton("Guardar y Conectar") { _, _ ->
                val rawIp = input.text.toString().trim()
                val normalized = normalizeIpWithPort(rawIp)
                if (normalized.isNotEmpty()) {
                    prefs.edit().putString(KEY_SERVER_IP, normalized).apply()
                    Toast.makeText(this, "Conectando a: $normalized...", Toast.LENGTH_SHORT).show()
                    errorLayout.visibility = View.GONE
                    webView.visibility = View.VISIBLE
                    webView.clearCache(true)
                    loadMeseroUrl()
                }
            }
            .setNeutralButton("Por Defecto") { _, _ ->
                prefs.edit().putString(KEY_SERVER_IP, DEFAULT_SERVER_IP).apply()
                Toast.makeText(this, "Restablecido a: $DEFAULT_SERVER_IP", Toast.LENGTH_SHORT).show()
                errorLayout.visibility = View.GONE
                webView.visibility = View.VISIBLE
                webView.clearCache(true)
                loadMeseroUrl()
            }
            .setNegativeButton("Cancelar", null)
            .create()

        dialog.show()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            if (backPressedTime + 2000 > System.currentTimeMillis()) {
                super.onBackPressed()
            } else {
                Toast.makeText(this, "Presiona de nuevo para salir de Basilico", Toast.LENGTH_SHORT).show()
                backPressedTime = System.currentTimeMillis()
            }
        }
    }
}

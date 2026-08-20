package com.androidtoolsuite.app.plugins.phigros

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.security.KeyStore
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

internal class SecureTokenStore(context: Context) {
    private val preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun profiles(): List<TokenProfile> = readItems().mapNotNull { item ->
        runCatching {
            TokenProfile(
                id = item.getString("id"),
                label = item.optString("label", "Phigros"),
                server = PhigrosServer.valueOf(item.optString("server", PhigrosServer.CN.name)),
                createdAt = item.optLong("createdAt", 0L),
                lastUsedAt = item.optLong("lastUsedAt", 0L),
            )
        }.getOrNull()
    }.sortedByDescending { it.lastUsedAt }

    fun selectedId(): String? = preferences.getString(KEY_SELECTED, null)

    /** Metadata-only profile snapshot for the read-only Migration Bridge. */
    fun migrationProfiles(): JSONArray = JSONArray().also { result ->
        readItems().forEach { item ->
            result.put(
                JSONObject()
                    .put("id", item.getString("id"))
                    .put("label", item.optString("label", "Phigros"))
                    .put("server", item.optString("server", PhigrosServer.CN.name))
                    .put("createdAt", item.optLong("createdAt", 0L))
                    .put("lastUsedAt", item.optLong("lastUsedAt", 0L)),
            )
        }
    }

    /** Plaintext is exposed only to the encrypted streaming export path. */
    fun migrationSecrets(): JSONArray = JSONArray().also { result ->
        val key = existingSecretKey()
        readItems().forEach { item ->
            result.put(
                JSONObject()
                    .put("id", item.getString("id"))
                    .put("token", decrypt(item.getString("secret"), key)),
            )
        }
    }

    fun restoreMigrationProfiles(profiles: JSONArray, selectedId: String?) {
        val restored = JSONArray()
        val ids = linkedSetOf<String>()
        for (index in 0 until profiles.length()) {
            val item = profiles.getJSONObject(index)
            val id = item.getString("id").trim()
            require(id.isNotEmpty() && ids.add(id)) { "账号档案 ID 无效或重复" }
            val server = PhigrosServer.valueOf(item.optString("server", PhigrosServer.CN.name))
            restored.put(
                JSONObject()
                    .put("id", id)
                    .put("label", item.optString("label", "Phigros").trim().ifBlank { "Phigros ${server.label}" })
                    .put("server", server.name)
                    .put("createdAt", item.optLong("createdAt", 0L).coerceAtLeast(0L))
                    .put("lastUsedAt", item.optLong("lastUsedAt", 0L).coerceAtLeast(0L)),
            )
        }
        require(selectedId == null || selectedId in ids) { "所选账号不在档案列表中" }
        val editor = preferences.edit().putString(KEY_PROFILES, restored.toString())
        if (selectedId == null) editor.remove(KEY_SELECTED) else editor.putString(KEY_SELECTED, selectedId)
        check(editor.commit()) { "无法保存账号档案" }
        check(migrationProfiles().toString() == restored.toString() && this.selectedId() == selectedId) {
            "账号档案恢复校验失败"
        }
    }

    fun restoreMigrationSecrets(tokens: JSONArray) {
        val items = readItems()
        val byId = items.associateBy { it.getString("id") }
        val plain = linkedMapOf<String, String>()
        for (index in 0 until tokens.length()) {
            val item = tokens.getJSONObject(index)
            val id = item.getString("id")
            val token = item.getString("token")
            require(id in byId && plain.put(id, token) == null) { "SessionToken 账号无效或重复" }
            require(TOKEN_PATTERN.matches(token)) { "SessionToken 格式错误" }
        }
        require(plain.keys == byId.keys) { "SessionToken 与账号档案不完整匹配" }
        val restored = items.map { item ->
            JSONObject(item.toString()).put("secret", encrypt(checkNotNull(plain[item.getString("id")])))
        }
        val array = JSONArray()
        restored.forEach(array::put)
        check(preferences.edit().putString(KEY_PROFILES, array.toString()).commit()) {
            "无法保存 SessionToken"
        }
        check(plain.all { (id, token) -> get(id)?.token == token }) { "SessionToken 恢复校验失败" }
    }

    fun selected(): StoredToken? {
        val id = selectedId() ?: return null
        return get(id)
    }

    fun get(id: String): StoredToken? {
        val item = readItems().firstOrNull { it.optString("id") == id } ?: return null
        val profile = profiles().firstOrNull { it.id == id } ?: return null
        return runCatching { StoredToken(profile, decrypt(item.getString("secret"))) }.getOrNull()
    }

    fun save(label: String, token: String, server: PhigrosServer): TokenProfile {
        require(TOKEN_PATTERN.matches(token)) { "SessionToken 应为 25 位字母或数字" }
        val now = System.currentTimeMillis()
        val existing = readItems().firstOrNull { item ->
            runCatching { decrypt(item.optString("secret")) == token }.getOrDefault(false)
        }
        val id = existing?.optString("id")?.takeIf { it.isNotBlank() } ?: UUID.randomUUID().toString()
        val createdAt = existing?.optLong("createdAt", now) ?: now
        val replacement = JSONObject()
            .put("id", id)
            .put("label", label.trim().ifBlank { "Phigros ${server.label}" })
            .put("server", server.name)
            .put("createdAt", createdAt)
            .put("lastUsedAt", now)
            .put("secret", encrypt(token))
        val items = readItems().filterNot { it.optString("id") == id }.toMutableList()
        items += replacement
        writeItems(items)
        preferences.edit().putString(KEY_SELECTED, id).apply()
        return TokenProfile(id, replacement.getString("label"), server, createdAt, now)
    }

    fun select(id: String) {
        val items = readItems()
        require(items.any { it.optString("id") == id }) { "令牌不存在" }
        val now = System.currentTimeMillis()
        items.first { it.optString("id") == id }.put("lastUsedAt", now)
        writeItems(items)
        preferences.edit().putString(KEY_SELECTED, id).apply()
    }

    fun updateLabel(id: String, label: String): TokenProfile {
        val items = readItems()
        val item = items.firstOrNull { it.optString("id") == id } ?: error("令牌不存在")
        val server = PhigrosServer.valueOf(item.optString("server", PhigrosServer.CN.name))
        item.put("label", label.trim().ifBlank { "Phigros ${server.label}" })
        writeItems(items)
        return TokenProfile(
            id = id,
            label = item.getString("label"),
            server = server,
            createdAt = item.optLong("createdAt", 0L),
            lastUsedAt = item.optLong("lastUsedAt", 0L),
        )
    }

    fun delete(id: String) {
        val remaining = readItems().filterNot { it.optString("id") == id }
        writeItems(remaining)
        val next = remaining.maxByOrNull { it.optLong("lastUsedAt", 0L) }?.optString("id")
        preferences.edit().putString(KEY_SELECTED, next).apply()
    }

    private fun readItems(): MutableList<JSONObject> {
        val root = runCatching { JSONArray(preferences.getString(KEY_PROFILES, "[]")) }.getOrElse { JSONArray() }
        return MutableList(root.length()) { index -> root.optJSONObject(index) ?: JSONObject() }
            .filter { it.has("id") }
            .toMutableList()
    }

    private fun writeItems(items: List<JSONObject>) {
        val array = JSONArray()
        items.forEach(array::put)
        preferences.edit().putString(KEY_PROFILES, array.toString()).apply()
    }

    private fun encrypt(plainText: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        val encrypted = cipher.doFinal(plainText.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + "." +
            Base64.encodeToString(encrypted, Base64.NO_WRAP)
    }

    private fun decrypt(payload: String): String {
        return decrypt(payload, secretKey())
    }

    private fun decrypt(payload: String, key: SecretKey): String {
        val parts = payload.split('.', limit = 2)
        require(parts.size == 2) { "令牌密文损坏" }
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(
            Cipher.DECRYPT_MODE,
            key,
            GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)),
        )
        return String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), Charsets.UTF_8)
    }

    private fun existingSecretKey(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        return requireNotNull(keyStore.getKey(KEY_ALIAS, null) as? SecretKey) {
            "Phigros SessionToken Keystore 密钥不存在"
        }
    }

    private fun secretKey(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build(),
        )
        return generator.generateKey()
    }

    companion object {
        private const val PREFS = "phigros_data_studio_tokens"
        private const val KEY_PROFILES = "profiles_v2"
        private const val KEY_SELECTED = "selected_profile"
        private const val KEY_ALIAS = "ats.phigros.session-token.v2"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        val TOKEN_PATTERN = Regex("^[A-Za-z0-9]{25}$")
    }
}

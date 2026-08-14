package com.androidtoolsuite.app.plugins.phigros

import android.app.Activity
import com.androidtoolsuite.app.plugin.migration.DatasetCategory
import com.androidtoolsuite.app.plugin.migration.DatasetRestoreMode
import com.androidtoolsuite.app.plugin.migration.LegacyDataBridge
import com.androidtoolsuite.app.plugin.migration.LegacyDatasetDescriptor
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.io.FilterOutputStream
import java.io.OutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

internal class PhigrosLegacyDataBridge : LegacyDataBridge {
    override fun datasets(activity: Activity): List<LegacyDatasetDescriptor> {
        val tokenStore = SecureTokenStore(activity)
        val dataDirectory = File(activity.filesDir, DATA_DIRECTORY)
        val catalog = File(dataDirectory, CATALOG_FILE)
        val profilesSize = activity.getSharedPreferences(TOKEN_PREFS, Activity.MODE_PRIVATE)
            .getString("profiles_v2", "[]").orEmpty().toByteArray().size.toLong()
        val result = mutableListOf(
            LegacyDatasetDescriptor(
                "profiles",
                "账号档案与当前选择",
                DatasetCategory.SETTINGS,
                profilesSize + 128L,
                1,
                false,
                DatasetRestoreMode.REPLACE,
            ),
            LegacyDatasetDescriptor(
                "analysis-data",
                "成绩缓存与分析历史",
                DatasetCategory.DATA,
                dataSize(dataDirectory) - catalog.length(),
                1,
                false,
                DatasetRestoreMode.REPLACE,
                listOf("profiles"),
            ),
        )
        if (tokenStore.migrationProfiles().length() > 0) {
            result += LegacyDatasetDescriptor(
                "session-tokens",
                "SessionToken",
                DatasetCategory.SECRET,
                tokenStore.migrationProfiles().length() * 128L,
                1,
                true,
                DatasetRestoreMode.REPLACE,
                listOf("profiles"),
            )
        }
        if (catalog.isFile || legacyCatalog(activity).isNotBlank()) {
            result += LegacyDatasetDescriptor(
                "song-catalog",
                "曲库缓存",
                DatasetCategory.CACHE,
                if (catalog.isFile) catalog.length() else legacyCatalog(activity).toByteArray().size.toLong(),
                1,
                false,
                DatasetRestoreMode.REPLACE,
            )
        }
        return result
    }

    override fun exportDataset(activity: Activity, datasetId: String, output: OutputStream) {
        when (datasetId) {
            "profiles" -> {
                val store = SecureTokenStore(activity)
                val widget = activity.getSharedPreferences(WIDGET_PREFS, Activity.MODE_PRIVATE)
                val root = JSONObject()
                    .put("formatVersion", 1)
                    .put("profiles", store.migrationProfiles())
                    .put("selectedProfile", store.selectedId() ?: JSONObject.NULL)
                    .put(
                        "widget",
                        JSONObject()
                            .put("rksBits", widget.getLong("rks", 0L))
                            .put("count", widget.getInt("count", 0))
                            .put("player", widget.getString("player", "").orEmpty()),
                    )
                output.write(root.toString().toByteArray(Charsets.UTF_8))
            }
            "analysis-data" -> writeAnalysisData(File(activity.filesDir, DATA_DIRECTORY), output)
            "session-tokens" -> {
                val root = JSONObject()
                    .put("formatVersion", 1)
                    .put("tokens", SecureTokenStore(activity).migrationSecrets())
                output.write(root.toString().toByteArray(Charsets.UTF_8))
            }
            "song-catalog" -> {
                val catalog = File(activity.filesDir, "$DATA_DIRECTORY/$CATALOG_FILE")
                if (catalog.isFile) FileInputStream(catalog).use { it.copyTo(output) }
                else output.write(legacyCatalog(activity).toByteArray(Charsets.UTF_8))
            }
            else -> error("未知 Dataset：$datasetId")
        }
    }

    private fun writeAnalysisData(directory: File, output: OutputStream) {
        ZipOutputStream(NonClosingOutputStream(output)).use { zip ->
            directory.walkTopDown()
                .filter { it.isFile && it.name != CATALOG_FILE && !it.name.endsWith(".tmp") }
                .sortedBy { it.relativeTo(directory).invariantSeparatorsPath }
                .forEach { file ->
                    val relative = file.relativeTo(directory).invariantSeparatorsPath
                    val entry = ZipEntry(relative).apply { time = 0L }
                    zip.putNextEntry(entry)
                    FileInputStream(file).use { it.copyTo(zip) }
                    zip.closeEntry()
                }
        }
    }

    private fun legacyCatalog(activity: Activity): String =
        activity.getSharedPreferences("phigros_advisor", Activity.MODE_PRIVATE)
            .getString("difficulty_tsv", "").orEmpty()

    private fun dataSize(directory: File): Long =
        directory.walkTopDown().filter(File::isFile).sumOf(File::length)

    /** ZipOutputStream must finish its own footer without closing the Host-owned Dataset stream. */
    private class NonClosingOutputStream(output: OutputStream) : FilterOutputStream(output) {
        override fun close() = flush()
    }

    private companion object {
        const val DATA_DIRECTORY = "phigros-data-studio"
        const val CATALOG_FILE = "catalog.tsv"
        const val TOKEN_PREFS = "phigros_data_studio_tokens"
        const val WIDGET_PREFS = "phigros_data_studio_widget"
    }
}

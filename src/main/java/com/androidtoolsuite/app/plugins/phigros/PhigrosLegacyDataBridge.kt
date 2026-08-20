package com.androidtoolsuite.app.plugins.phigros

import android.app.Activity
import com.androidtoolsuite.app.plugin.migration.DatasetCategory
import com.androidtoolsuite.app.plugin.migration.DatasetRestoreMode
import com.androidtoolsuite.app.plugin.migration.LegacyDataBridge
import com.androidtoolsuite.app.plugin.migration.LegacyDatasetDescriptor
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.FilterInputStream
import java.io.FilterOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.util.zip.ZipInputStream
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
        if (tokenStore.hasMigrationSecrets()) {
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

    override fun supportsImport(datasetId: String, dataFormatVersion: Int): Boolean =
        dataFormatVersion == 1 && datasetId in SUPPORTED_IMPORTS

    override fun hasData(activity: Activity, datasetId: String): Boolean = when (datasetId) {
        "profiles" -> SecureTokenStore(activity).migrationProfiles().length() > 0 ||
            activity.getSharedPreferences(WIDGET_PREFS, Activity.MODE_PRIVATE).all.isNotEmpty()
        "analysis-data" -> File(activity.filesDir, DATA_DIRECTORY).walkTopDown()
            .any { it.isFile && it.name != CATALOG_FILE && !it.name.endsWith(".tmp") }
        "session-tokens" -> SecureTokenStore(activity).hasMigrationSecrets()
        "song-catalog" -> File(activity.filesDir, "$DATA_DIRECTORY/$CATALOG_FILE").isFile ||
            legacyCatalog(activity).isNotBlank()
        else -> error("未知 Dataset：$datasetId")
    }

    override fun supportsRestoreMode(
        datasetId: String,
        dataFormatVersion: Int,
        mode: DatasetRestoreMode,
    ): Boolean = supportsImport(datasetId, dataFormatVersion) && mode == DatasetRestoreMode.REPLACE

    override fun importDataset(
        activity: Activity,
        datasetId: String,
        dataFormatVersion: Int,
        restoreMode: DatasetRestoreMode,
        input: InputStream,
    ) {
        require(supportsImport(datasetId, dataFormatVersion)) { "不支持的 Phigros Dataset" }
        require(supportsRestoreMode(datasetId, dataFormatVersion, restoreMode)) { "此 Dataset 不支持合并" }
        when (datasetId) {
            "profiles" -> restoreProfiles(activity, input, dataFormatVersion)
            "analysis-data" -> restoreAnalysisData(File(activity.filesDir, DATA_DIRECTORY), input)
            "session-tokens" -> restoreSessionTokens(activity, input, dataFormatVersion)
            "song-catalog" -> restoreFile(File(activity.filesDir, "$DATA_DIRECTORY/$CATALOG_FILE"), input)
        }
    }

    override fun supportsDelete(datasetId: String): Boolean = datasetId in SUPPORTED_IMPORTS

    override fun deleteDataset(activity: Activity, datasetId: String) {
        require(supportsDelete(datasetId)) { "不支持删除的 Phigros Dataset" }
        when (datasetId) {
            "profiles" -> {
                SecureTokenStore(activity).clearMigrationProfiles()
                val widget = activity.getSharedPreferences(WIDGET_PREFS, Activity.MODE_PRIVATE)
                check(widget.edit().clear().commit()) { "无法删除 Phigros 小部件状态" }
                check(widget.all.isEmpty()) { "Phigros 小部件状态删除校验失败" }
            }
            "analysis-data" -> deleteAnalysisData(File(activity.filesDir, DATA_DIRECTORY))
            "session-tokens" -> SecureTokenStore(activity).clearMigrationSecrets()
            "song-catalog" -> {
                val catalog = File(activity.filesDir, "$DATA_DIRECTORY/$CATALOG_FILE")
                if (catalog.exists() && !catalog.delete()) error("无法删除曲库缓存")
                val legacy = activity.getSharedPreferences("phigros_advisor", Activity.MODE_PRIVATE)
                check(legacy.edit().remove("difficulty_tsv").commit()) { "无法删除旧曲库缓存" }
                check(!catalog.exists() && legacy.getString("difficulty_tsv", "").isNullOrEmpty()) {
                    "曲库缓存删除校验失败"
                }
            }
        }
    }

    private fun deleteAnalysisData(directory: File) {
        if (!directory.exists()) return
        directory.listFiles().orEmpty()
            .filterNot { it.name == CATALOG_FILE }
            .forEach { child ->
                check(child.deleteRecursively()) { "无法删除分析数据：${child.name}" }
            }
        check(directory.listFiles().orEmpty().all { it.name == CATALOG_FILE }) {
            "分析数据删除校验失败"
        }
    }

    private fun restoreProfiles(activity: Activity, input: InputStream, dataFormatVersion: Int) {
        val root = JSONObject(input.reader(Charsets.UTF_8).readText())
        require(root.optInt("formatVersion", 0) == dataFormatVersion) { "账号档案格式版本不一致" }
        val selected = if (root.isNull("selectedProfile")) null else root.optString("selectedProfile").ifBlank { null }
        SecureTokenStore(activity).restoreMigrationProfiles(root.getJSONArray("profiles"), selected)
        val widget = root.getJSONObject("widget")
        val preferences = activity.getSharedPreferences(WIDGET_PREFS, Activity.MODE_PRIVATE)
        val rksBits = widget.getLong("rksBits")
        val count = widget.getInt("count")
        val player = widget.getString("player")
        check(
            preferences.edit().clear()
                .putLong("rks", rksBits)
                .putInt("count", count)
                .putString("player", player)
                .commit(),
        ) { "无法保存 Phigros 小部件状态" }
        check(
            preferences.getLong("rks", Long.MIN_VALUE) == rksBits &&
                preferences.getInt("count", Int.MIN_VALUE) == count &&
                preferences.getString("player", null) == player,
        ) { "Phigros 小部件状态恢复校验失败" }
    }

    private fun restoreSessionTokens(activity: Activity, input: InputStream, dataFormatVersion: Int) {
        val root = JSONObject(input.reader(Charsets.UTF_8).readText())
        require(root.optInt("formatVersion", 0) == dataFormatVersion) { "SessionToken 格式版本不一致" }
        SecureTokenStore(activity).restoreMigrationSecrets(root.getJSONArray("tokens"))
    }

    private fun restoreAnalysisData(directory: File, input: InputStream) {
        val parent = checkNotNull(directory.parentFile) { "Phigros 数据目录无效" }
        check(parent.exists() || parent.mkdirs()) { "无法创建 Phigros 数据父目录" }
        val suffix = java.lang.Long.toHexString(System.nanoTime())
        val staging = File(parent, "${directory.name}.bridge-import-$suffix")
        val previous = File(parent, "${directory.name}.bridge-previous-$suffix")
        check(staging.mkdirs()) { "无法创建 Phigros 恢复暂存目录" }
        try {
            val currentCatalog = File(directory, CATALOG_FILE)
            if (currentCatalog.isFile) {
                val stagedCatalog = File(staging, CATALOG_FILE)
                FileInputStream(currentCatalog).use { source ->
                    FileOutputStream(stagedCatalog).use { target -> source.copyTo(target) }
                }
            }
            extractAnalysisZip(staging, input)
            if (directory.exists() && !directory.renameTo(previous)) {
                throw IOException("无法暂存旧 Phigros 数据")
            }
            if (!staging.renameTo(directory)) {
                if (previous.exists()) previous.renameTo(directory)
                throw IOException("无法切换 Phigros 恢复数据")
            }
            previous.deleteRecursively()
        } catch (error: Throwable) {
            staging.deleteRecursively()
            if (!directory.exists() && previous.exists()) previous.renameTo(directory)
            throw error
        }
    }

    private fun extractAnalysisZip(directory: File, input: InputStream) {
        val root = directory.canonicalFile
        val prefix = root.path + File.separator
        val seen = linkedSetOf<String>()
        var total = 0L
        ZipInputStream(NonClosingInputStream(input)).use { zip ->
            var entry = zip.nextEntry
            while (entry != null) {
                if (!entry.isDirectory) {
                    val relative = entry.name.replace('\\', '/').trim('/')
                    require(relative.isNotEmpty() && seen.add(relative)) { "Dataset 包含无效或重复路径" }
                    val target = File(root, relative).canonicalFile
                    require(target.path.startsWith(prefix)) { "Dataset 路径越界" }
                    val targetParent = checkNotNull(target.parentFile) { "Dataset 目标目录无效" }
                    check(targetParent.exists() || targetParent.mkdirs()) { "无法创建 Dataset 目录" }
                    FileOutputStream(target).use { output ->
                        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                        var read: Int
                        while (zip.read(buffer).also { read = it } != -1) {
                            total += read
                            require(total <= MAX_ANALYSIS_BYTES) { "分析数据解压后超过限制" }
                            output.write(buffer, 0, read)
                        }
                        output.fd.sync()
                    }
                }
                zip.closeEntry()
                entry = zip.nextEntry
            }
        }
    }

    private fun restoreFile(destination: File, input: InputStream) {
        val parent = checkNotNull(destination.parentFile) { "Dataset 目标目录无效" }
        check(parent.exists() || parent.mkdirs()) { "无法创建 Dataset 目标目录" }
        val suffix = java.lang.Long.toHexString(System.nanoTime())
        val staging = File(parent, "${destination.name}.bridge-import-$suffix")
        val previous = File(parent, "${destination.name}.bridge-previous-$suffix")
        try {
            FileOutputStream(staging).use { output ->
                input.copyTo(output)
                output.fd.sync()
            }
            if (destination.exists() && !destination.renameTo(previous)) {
                throw IOException("无法暂存旧 Dataset")
            }
            if (!staging.renameTo(destination)) {
                if (previous.exists()) previous.renameTo(destination)
                throw IOException("无法切换恢复后的 Dataset")
            }
            previous.delete()
        } finally {
            staging.delete()
            if (!destination.exists() && previous.exists()) previous.renameTo(destination)
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

    private class NonClosingInputStream(input: InputStream) : FilterInputStream(input) {
        override fun close() = Unit
    }

    private companion object {
        const val DATA_DIRECTORY = "phigros-data-studio"
        const val CATALOG_FILE = "catalog.tsv"
        const val TOKEN_PREFS = "phigros_data_studio_tokens"
        const val WIDGET_PREFS = "phigros_data_studio_widget"
        const val MAX_ANALYSIS_BYTES = 512L * 1024L * 1024L
        val SUPPORTED_IMPORTS = setOf("profiles", "analysis-data", "session-tokens", "song-catalog")
    }
}

package com.androidtoolsuite.app.plugins.phigros

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PhigrosLegacyFixtureTest {
    @Test fun fixtureCoversProfilesServersSelectionAndTokens() {
        val profiles = fixture("profiles.json")
        val items = profiles.getJSONArray("profiles")
        assertEquals(2, items.length())
        assertEquals("cn-main", profiles.getString("selectedProfile"))
        assertEquals(setOf("CN", "GLOBAL"), (0 until items.length()).map {
            items.getJSONObject(it).getString("server")
        }.toSet())

        val tokens = fixture("session-tokens.json").getJSONArray("tokens")
        val profileIds = (0 until items.length()).map { items.getJSONObject(it).getString("id") }.toSet()
        val tokenIds = (0 until tokens.length()).map { tokens.getJSONObject(it).getString("id") }.toSet()
        assertEquals(profileIds, tokenIds)
        assertTrue((0 until tokens.length()).all {
            SecureTokenStore.TOKEN_PATTERN.matches(tokens.getJSONObject(it).getString("token"))
        })
        assertFalse(SecureTokenStore.TOKEN_PATTERN.matches("damaged-token"))
        assertEquals(0, org.json.JSONArray().length())
    }

    private fun fixture(name: String) = JSONObject(
        checkNotNull(javaClass.getResource("/legacy/$name")).readText(),
    )
}

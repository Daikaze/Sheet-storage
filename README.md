# Token Form Storage v1.1.0

Foundry VTT **v14** / D&D 5e **6.0.6**. Uses standard Foundry ApplicationV2 controls and styling.

## Install

In **Foundry Setup > Add-on Modules > Install Module**, paste the manifest:

```
https://raw.githubusercontent.com/Daikaze/Sheet-storage/main/module.json
```

Or download the ZIP and extract it into `Data/modules/token-form-storage/`.

## NEW: World Actor forms — works without a token on the map

1. Open an **Actor from the Actors sidebar**. You do not need to place a token.
2. Click **Token Forms** in the Actor sheet header.
3. **Add** a world Actor of the **same type** (character vs NPC), or click **Save Current as Another Form**.
4. Choose **Switch** to replace the sidebar Actor's full form: system/HP/abilities, character image, prototype token appearance, owned items, features, spells, and active effects.
5. Edit the Actor's sheet as normal. When you switch again, the current form's changes are saved for the next time. **Save Current** manually saves a checkpoint.
6. The Actor ID remains unchanged, so its actor sheet is still accessible and newly dragged tokens use the currently active form.

These forms are stored on the **world Actor**, not any scene. They are snapshots of the selected source Actors, so the source Actor remains unchanged. In actor mode, switching changes the world Actor itself and thus affects **all linked tokens** and players using it; unlinked tokens retain their separate data. If a GM switches, linked token images and sizes on scenes also synchronize, except tokens using individual token-form storage.

**Important:** Actor-based forms cannot change the Actor's document type (NPC to character or vice versa). The source dropdown only shows matching types. Actor-owned effects and items are recreated with retained IDs when switching, so test in a backed-up world with third-party automation modules before regular use.

## Existing: individual placed-token forms

- Select a placed token, then use the token HUD icon or open the **synthetic/unlinked token's** actor sheet and click **Token Forms**.
- Add or clone another world Actor and switch the **same token** in place without changing position, ID, rotation, or initiative.
- Unlinked token instances keep separate HP, item, and effect states per form.
- A placed-token's forms remain stored on that individual token, separately from Actor-based forms.

## What's new in v1.1.0

- Actor forms on the sidebar: no scene or selected token necessary.
- Full Actor data snapshots for HP/stats, spells/items/activities/features/effects and artwork.
- Actor-based and token-based form storage remain separate.
- Still uses native Foundry controls/theme.
- v1.0.1 width/height fix retained.

**Validation:** Static syntax and automated data tests are included with the source. Real Foundry v14 with the installed D&D 5e 6.0.6 system is needed for final live testing.

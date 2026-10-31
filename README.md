# Token Form Storage

**Foundry VTT v14 • D&D 5e 6.0.6 • v1.0.0**

Store and switch complete Actor forms on an existing placed token without dragging a replacement. Changes include artwork, actor stats, HP, abilities, attacks, spells, features, items, and effects. Token position, ID, and combatant are preserved.

## Install through Foundry

In Foundry Setup go to **Add-on Modules → Install Module**, then paste this Manifest URL:

```text
https://raw.githubusercontent.com/Daikaze/Sheet-storage/main/module.json
```

The manifest downloads the packaged ZIP from this repository.

## Use

1. Place a token and select it.
2. Open its Actor sheet and choose **Token Forms**, or use the Token HUD layers control.
3. Choose another world Actor and click **Add**, or clone the current Actor into a new independent form (GM only).
4. Click **Switch** on any saved form. The token remains on the map.
5. Unlinked tokens remember their HP, item and effect overrides separately per form. Linked token forms use their referenced world Actors.

## Permissions and limitations

GMs can manage any token; players need ownership and update permission. Storage is on individual placed tokens, not on the world Actor's prototype token. For linked Actors, edits are shared by all linked tokens. Back up your world and test compatibility with Midi-QOL or other automation modules before campaign use.

Source code and templates are included inside the distribution ZIP. This initial version was syntax checked and passed automated storage tests, but has not been live-tested in Foundry v14.

# MEATER

Verfolge deine kabellosen MEATER-Fleischthermometer in Gladys: Kern- und
Umgebungstemperatur, Zieltemperatur, Restzeit und Status des Garvorgangs, und
Szenen, die im richtigen Moment des Garvorgangs starten.

> Nicht mit Apption Labs / MEATER verbunden. MEATER ist eine Marke von
> Apption Labs. **Ohne die Hardware entwickelt: Rückmeldungen sind
> willkommen**, im [Gladys-Forum](https://community.gladysassistant.com) oder
> in den [Issues](https://github.com/guim31/gladys-meater/issues).

## Überblick

Die Integration liest deine Fühler über die **offizielle MEATER-Cloud-API**,
mit dem Konto der MEATER-App. Jeder Fühler wird ein Gladys-Gerät, mit seinen
Temperaturen und seinem Garvorgang. Drei Szenen-Auslöser markieren die
Momente eines Garvorgangs (fast fertig, vom Feuer nehmen, Ruhezeit vorbei),
und ein Dashboard-Widget zeigt einen Garvorgang auf einen Blick.

Alles ist **nur lesend**: Gladys startet, ändert oder beendet nie einen
Garvorgang. Der Garvorgang wird wie gewohnt in der MEATER-App eingerichtet.

## Voraussetzungen

- Gladys **5.1.0** oder neuer, mit Internetzugang.
- Ein MEATER-Fühler: MEATER, MEATER+, MEATER 2 Plus, MEATER Pro, MEATER Pro
  XL oder ein MEATER Block.
- Ein **MEATER-Cloud**-Konto, in der MEATER-App angemeldet.
- Während des Garvorgangs muss die MEATER-App (Smartphone oder Tablet) oder
  der Block mit dem Fühler (Bluetooth) **und** mit dem Internet verbunden
  bleiben: MEATER Cloud kennt nur, was die App oder der Block übermittelt.

## Konfiguration

Öffne in Gladys **Integrationen**, dann **MEATER**, Tab **Konfiguration**:

| Feld                              | Was einzugeben ist                                                                                                              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| E-Mail-Adresse                    | Die E-Mail-Adresse deines MEATER-Cloud-Kontos.                                                                                  |
| Passwort                          | Sein Passwort.                                                                                                                  |
| Sprache                           | Sprache der Funktionsnamen, der Garstatus und der Namen der Fleischstücke, die MEATER Cloud sendet (standardmäßig Französisch). |
| Aktualisierung während des Garens | Alle 15 s, 30 s (empfohlen) oder 60 s während eines Garvorgangs. Sonst jede Minute.                                             |

Speichere und klicke dann auf **Verbindung testen**: Die Meldung sagt, wie
viele Fühler MEATER Cloud gerade sieht.

Füge dann die Fühler hinzu:

1. Starte einen Garvorgang in der MEATER-App (ein Fühler erscheint in MEATER
   Cloud nur während eines Garvorgangs).
2. Klicke im Tab **Entdecken** auf die Suche und dann bei jedem Fühler auf
   **Zu Gladys hinzufügen**.

Ein einmal gesehener Fühler bleibt im Tab Entdecken, auch zwischen zwei
Garvorgängen.

## Geräte

Ein Gerät pro Fühler, „MEATER-Fühler“ genannt, gefolgt von den ersten 8
Zeichen seiner Kennung (benenne es in Gladys um). Alle Funktionen sind nur
lesend.

| Funktion                     | Inhalt                                                                                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Kerntemperatur               | Temperatur an der Spitze des Fühlers, im Fleisch (°C).                                                                                         |
| Umgebungstemperatur          | Temperatur um das Fleisch, im Ofen oder auf dem Grill (°C).                                                                                    |
| Zieltemperatur               | Das in der App eingestellte Ziel des Garvorgangs (°C).                                                                                         |
| Höchste erreichte Temperatur | Die höchste Kerntemperatur während des Garvorgangs (°C).                                                                                       |
| Restzeit                     | Die von MEATER geschätzte Restzeit (Minuten). Behält ihren letzten Wert, solange MEATER noch schätzt.                                          |
| Vergangene Zeit              | Zeit seit dem Start des Garvorgangs (Minuten).                                                                                                 |
| Status des Garvorgangs       | Kein Garvorgang, Nicht gestartet, Eingerichtet, Gart, Vom Feuer nehmen, Ruht, Fertig, Etwas zu wenig gegart, Etwas zu lange gegart, Übergart!. |
| Gargut                       | Der Name des Fleischstücks oder der Name, den du dem Garvorgang in der App gegeben hast.                                                       |
| Garvorgang läuft             | 1 vom Start des Garvorgangs bis zum Ende der Ruhezeit, sonst 0.                                                                                |
| Fühler verbunden             | 1, solange MEATER Cloud den Fühler sieht, sonst 0.                                                                                             |

Wenn ein Fühler nicht mehr gesehen wird (Garvorgang beendet, Fühler zurück im
Ladegerät, Smartphone außer Reichweite), geht „Fühler verbunden“ sofort auf 0
und die letzten Messwerte bleiben. Nach 30 Minuten ohne Nachricht gilt der
Garvorgang als beendet: „Garvorgang läuft“ geht auf 0 zurück und „Status des
Garvorgangs“ auf „Kein Garvorgang“.

## Dashboard-Widget

**MEATER-Garvorgang** zeigt einen Fühler: den Namen des Garvorgangs, die
Kern-, Ziel- und Umgebungstemperatur (live), die Restzeit, den Status des
Garvorgangs, die vergangene Zeit und ob der Fühler verbunden ist.

Wähle in seinen Einstellungen einen Fühler oder lass das Feld leer: Das
Widget zeigt dann den Fühler, der gerade gart.

## Szenen-Auslöser

Klicke in einer Szene auf **Auslöser hinzufügen** und wähle einen der
MEATER-Auslöser. Jeder löst **einmal pro Garvorgang** aus, auch wenn Gladys
mittendrin neu startet.

| Auslöser               | Wann                                                                                            | Filter                                | An die Szene weitergegebene Informationen                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------- |
| Garvorgang fast fertig | Die von MEATER geschätzte Restzeit fällt unter 5, 10, 15 oder 30 Minuten, Fleisch auf dem Feuer | Fühler (optional), Schwelle (Pflicht) | Gargut, Restzeit, Schwelle, Kern- und Zieltemperatur                        |
| Vom Feuer nehmen       | MEATER sagt, das Fleisch vom Feuer zu nehmen und ruhen zu lassen                                | Fühler (optional)                     | Gargut, Kern- und Zieltemperatur                                            |
| Ruhezeit vorbei        | Die Ruhezeit ist vorbei und MEATER gibt sein Urteil                                             | Fühler, Ergebnis (beide optional)     | Gargut, Ergebnis (Fertig, Etwas zu wenig gegart…), Kern- und Zieltemperatur |

Die weitergegebenen Texte (Status, Ergebnis) folgen der Sprache der
Konfiguration.

## Aktion

**Verbindung testen** (Tab Konfiguration) meldet sich bei MEATER Cloud an und
sagt, wie viele Fühler gerade sichtbar sind, oder was nicht stimmt (Passwort
abgelehnt, Dienst nicht erreichbar, zu viele Anfragen). Nach einem
abgelehnten Passwort ist es auch der Weg, es erneut zu versuchen, ohne die
Konfiguration zu speichern.

## Szenenbeispiele

Die Wörter in eckigen Klammern sind Informationen des Auslösers, die du mit
der Variablenauswahl des Szeneneditors in den Text einfügst.

- **Tisch decken**: Auslöser „Garvorgang fast fertig“ mit der Schwelle
  „10 Minuten“, Aktion „Nachricht senden“: „[Gargut] ist in 10 Minuten
  fertig, Zeit, den Tisch zu decken.“
- **Vom Feuer**: Auslöser „Vom Feuer nehmen“, Aktionen „Lichter blinken
  lassen“ in der Küche und „Auf einem Lautsprecher sprechen“: „Nimm [Gargut]
  vom Feuer, es hat [Kerntemperatur] °C.“
- **Essen ist fertig**: Auslöser „Ruhezeit vorbei“ mit dem Ergebnis
  „Fertig“, Aktion „Nachricht senden“ an die ganze Familie: „Essen ist
  fertig!“
- **Grill zu heiß**: Auslöser „Änderung von Gerätestatus“ auf der
  „Umgebungstemperatur“ des Fühlers, über 300 °C: eine Nachricht, nach dem
  Grill zu sehen.

## Aktualisierung und Kontingente

MEATER Cloud erlaubt **höchstens 60 Anfragen pro Minute und empfiehlt 2**.
Die Integration liest das Konto:

- im in der Konfiguration gewählten Takt, solange ein Garvorgang eingerichtet
  ist oder läuft (standardmäßig alle 30 s);
- sonst jede Minute, wie es die API-Dokumentation empfiehlt;
- nie zweimal innerhalb von 2 Sekunden;
- nach einem Fehler nach 1, 2, 4… Minuten, bis zu 10 Minuten (mindestens 5
  Minuten, wenn MEATER Cloud darum bittet, langsamer abzufragen).

Eine Anfrage antwortet für alle Fühler des Kontos. Die Integration sendet
Gladys nur die geänderten Werte (und jeden Wert mindestens alle 6 Stunden,
damit keiner veraltet wirkt), und sie aktualisiert sich selbst, ohne den
Gladys-Planer.

Was im Datenvolume der Integration gespeichert wird: das MEATER-Cloud-Token
(es läuft nicht ab) mit einem Fingerabdruck des Kontos, und die Liste der
gesehenen Fühler mit dem Gedächtnis ihres aktuellen Garvorgangs. Weder die
E-Mail-Adresse noch das Passwort werden dort geschrieben; das Passwort bleibt
in der Gladys-Konfiguration.

## Fehlerbehebung

- **„MEATER Cloud hat die E-Mail-Adresse oder das Passwort abgelehnt“**:
  Verwende die Adresse und das Passwort der MEATER-App und speichere die
  Konfiguration erneut. Die Integration versucht es nicht von selbst erneut,
  um das Konto nicht zu sperren.
- **Kein Fühler im Tab Entdecken**: Ein Fühler erscheint nur während eines
  Garvorgangs, solange die MEATER-App oder der Block mit ihm und mit dem
  Internet verbunden ist. Starte einen Garvorgang, klicke auf **Verbindung
  testen** und suche dann erneut.
- **Die Werte bewegen sich nicht mehr**: Das Smartphone mit der MEATER-App ist
  außer Bluetooth-Reichweite, im Ruhezustand oder offline. „Fühler verbunden“
  zeigt, ob MEATER Cloud den Fühler noch sieht.
- **„MEATER Cloud bittet darum, langsamer abzufragen“**: Ein anderes Programm
  liest dasselbe Konto zu oft. Wähle eine langsamere Aktualisierung während
  des Garens.
- **Mehr Details**: die Protokolle der Integration (Tab Überwachung). Die
  Umgebungsvariable `LOG_LEVEL=debug` zeigt jede Aktualisierung.

## Einschränkungen

- Nur Cloud: Gladys spricht nicht per Bluetooth mit dem Fühler. Die Daten
  kommen mit der Verzögerung der MEATER-App, von MEATER Cloud und des
  Aktualisierungstakts (standardmäßig 30 s).
- Die MEATER-Cloud-API ist in der Beta: MEATER kann sie ändern.
- Die API liefert einen Namen pro Garvorgang (das Fleischstück oder den Namen,
  den du eingegeben hast): Es gibt keinen eigenen Rezeptnamen.
- Die Restzeit ist die Schätzung von MEATER; am Anfang des Garvorgangs ist
  sie unbekannt.
- Die Temperaturen kommen in Grad Celsius.
- Nur lesend: weder Einrichtung des Garvorgangs noch Alarm aus Gladys.
- Ohne die Hardware und ohne Konto entwickelt: Das Verhalten wurde nach der
  offiziellen API-Dokumentation und der Home-Assistant-Integration
  geschrieben. Rückmeldungen sind willkommen.

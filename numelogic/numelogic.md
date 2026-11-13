# Especificació Funcional: Joc Web de Càlcul tipus "Paraulògic"

## 1. Descripció General
Desenvolupar una aplicació web tipus *Single Page Application* (SPA) inspirada en el funcionament del joc **Paraulògic**, però aplicada a les matemàtiques. L'objectiu del jugador és trobar tantes combinacions d'operacions matemàtiques com sigui possible per assolir un **número objectiu** partint d'un conjunt limitat de números base.

## 2. Stack Tecnològic Recomanat
* **Frontend:** HTML5, CSS3 (o Tailwind CSS) i JavaScript/TypeScript (React, Vue o Vanilla JS).
* **Emmagatzematge:** `localStorage` per guardar el progrés diari, la puntuació acumulada i les solucions ja trobades.
* **Arquitectura:** 100% Client-side (no requereix backend obligatori, tot i que la lògica de generació ha d'estar ben modularitzada).

## 3. Regles del Joc i Mecàniques

### 3.1. Elements del Tauler
* **Número Objectiu:** Un nombre enter positiu (ex. `24`, `50`, `112`).
* **Números Base:** Entre 4 i 5 nombres enters positius diferents entre si (ex. `[2, 3, 5, 7, 10]`).
* **Operadors Permesos:** Suma (`+`), Resta (`-`), Multiplicació (`×`) i Divisió (`÷`).

### 3.2. Regles d'Ús i Validació de les Operacions
1. **Reutilització de números:** Un mateix número base es pot utilitzar múltiples vegades dins d'una mateixa expressió, sempre que no infringeixi la regla de cancel·lació.
2. **Prioritat d'operacions / Avaluació:** L'expressió s'avalua seguint l'ordre matemàtic estàndard (jerarquia d'operacions: primer `×` i `÷`, després `+` i `-`) o bé permetent l'ús de parèntesis (a definir segons la interfície, preferiblement avaluació seqüencial d'esquerra a dreta o amb jerarquia matemàtica estàndard ben indicada a l'usuari). *Nota: S'ha d'assegurar que les divisions sempre donin resultats enters (sense decimals) en el resultat final.*
3. **Regla d'Anti-Cancel·lació (Crítica):** Està prohibit fer una operació i la seva inversa amb el **mateix número** dins de la mateixa expressió per inflar la puntuació.
   * *Exemple invàlid:* `+ 5` i `- 5` en la mateixa operació (ex: `20 + 4 + 5 - 5 = 24`).
   * *Exemple invàlid:* `× 2` i `÷ 2` en la mateixa operació (ex: `12 × 2 × 2 ÷ 2 = 24`).
   * *Exemple vàlid:* `+ 5` i `- 3` (operacions contràries però amb números diferents: `22 + 5 - 3 = 24`).
   * *Exemple vàlid:* `× 4` i `÷ 2` (operacions contràries amb números diferents: `12 × 4 ÷ 2 = 24`).
4. **Solucions úniques:** No es pot enviar exactament la mateixa expressió matemàtica dues vegades.

### 3.3. Sistema de Puntuació
Cada solució vàlida que doni com a resultat exacte el **Número Objectiu** suma punts en funció dels operadors utilitzats. Com més llarga i complexa sigui l'operació, més punts s'obtenen:
* **Suma (`+`):** 1 punt per cada operador utilitzat.
* **Resta (`-`):** 2 punts per cada operador utilitzat.
* **Multiplicació (`×`):** 3 punts per cada operador utilitzat.
* **Divisió (`÷`):** 5 punts per cada operador utilitzat.

*(Exemple: Per arribar a `24` amb els números `[2, 3, 4, 8]`, l'expressió `8 × 4 - 8` utilitza una multiplicació (3 pts) i una resta (2 pts) = **5 punts**).*

### 3.4. Nivells de Progrés (Rangs)
Com al Paraulògic, el sistema calcularà prèviament un conjunt de solucions possibles (limitat a un màxim de passos, ex. fins a 4 operadors) per establir una puntuació màxima de referència i definir fites:
* Principiant (0%)
* Calculador (10%)
* Àgil (25%)
* Matemàtic (50%)
* Geni Numèric (75%)
* Pitagòric (100% de la puntuació de referència)

## 4. Requisits de la Interfície d'Usuari (UI/UX)

1. **Capçalera:**
   * Títol del joc.
   * Barra de progrés amb el rang actual i els punts acumulats.
2. **Zona del Número Objectiu:**
   * Visualització clara i destacada del número a aconseguir.
3. **Visor de l'Operació Actual:**
   * Pantalla on es va construint l'expressió (ex: `10 × 3 - 6`) i mostra en temps real el resultat parcial (si és vàlid) o un indicador visual.
4. **Teclat del Joc (Disseny tipus Rusk / Hexàgons o Botons Circulars):**
   * Un bloc amb els 4-5 números base disponibles.
   * Un bloc amb els 4 operadors (`+`, `-`, `×`, `÷`).
   * Botons d'acció: **Esborrar** (últim caràcter), **Netejar** (tot) i **Comprovar / Enviar** (Enter).
5. **Llista de Solucions Trobades:**
   * Un panell desplegable o lateral que mostra totes les operacions vàlides que l'usuari ja ha descobert, ordenades cronològicament o per puntuació, indicant els punts obtinguts per cadascuna.
6. **Feedback Visual (Missatges Toast):**
   * Missatges clars d'error quan una operació no és vàlida: *"El resultat no coincideix amb l'objectiu"*, *"Operació cancel·lada detectada (+X i -X)"*, *"Aquesta combinació ja l'has trobat"*, *"Divisió no exacta"*.
   * Animació o missatge positiu en sumar punts: *"+8 punts!"*.

## 5. Arquitectura Lògica (Mòduls a implementar)

### 5.1. `generator.js` (Generador de Reptes)
* Funció que genera un repte diari (basat en la data actual com a *seed*) o un repte aleatori.
* Ha de garantir que existeixen múltiples combinacions vàlides per arribar al número objectiu.

### 5.2. `validator.js` (Motor de Regles i Avaluació)
* **Parser d'expressió:** Converteix l'string de l'usuari en tokens (números i operadors).
* **Validador de sintaxi:** Comprova que no hi hagi dos operadors seguits ni que acabi en operador.
* **Validador d'anti-cancel·lació:** Analitza els parells `(operador, operand)` de l'expressió. Si detecta `(+ N)` i `(- N)` o `(× N)` i `(÷ N)` per a un mateix valor `N`, retorna error.
* **Calculador:** Avalua l'expressió matemàtica de manera segura (sense utilitzar `eval()` directe sense sanititzar) i comprova que el resultat sigui exactament igual al Número Objectiu.
* **Calculador de punts:** Compta els operadors de l'expressió vàlida i retorna la suma de punts segons la taula de pesos (`+`:1, `-`:2, `×`:3, `÷`:5).

### 5.3. `storage.js` (Gestió d'Estat)
* Guarda a `localStorage` l'estat de la partida actual (número objectiu, números base, llista d'expressions trobades i puntuació total).

## 6. Instruccions per a la IA / Desenvolupador
* Escriu codi net, modular i ben comentat.
* Dissenya una interfície moderna, responsiva (adaptada a mòbil i escriptori) i minimalista, inspirada en l'estètica dels jocs de lògica diaris (com Wordle o Paraulògic).
* Implementa suport per a teclat físic (números, `+`, `-`, `*`, `/`, `Backspace`, `Enter`) a més dels clics als botons en pantalla.
* Comença generant l'estructura de fitxers i el codi complet i funcional de l'aplicació.

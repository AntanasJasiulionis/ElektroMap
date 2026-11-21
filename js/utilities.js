'use strict';

// Debounce
const debounce = function (callbackFn, delay = 1000) {
  let timeout;

  return function (...inputs) {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      callbackFn(...inputs);
    }, delay);
  };
};

// Throttle
const throttle = function (callbackFn, delay = 1000, instant = true) {
  let shouldWait = false;
  let waitingInputs = null;

  const timeOutFunction = () => {
    if (waitingInputs === null) return (shouldWait = false);

    callbackFn(...waitingInputs);
    waitingInputs = null;
    setTimeout(timeOutFunction, delay);
  };

  return function (...inputs) {
    if (shouldWait) {
      waitingInputs = inputs;
      return;
    }

    instant
      ? callbackFn(...inputs)
      : setTimeout(callbackFn.bind(null, ...inputs), 100);
    shouldWait = true;

    setTimeout(timeOutFunction, delay);
  };
};

// Calculate distance between 2 coordinates
const getDistance = function (coord1, coord2) {
  const R = 2 * 6371000;
  const [lat1, lon1] = coord1;
  const [lat2, lon2] = coord2;

  // Convert degrees to radius
  const degToRad = function (degree) {
    return (degree * Math.PI) / 180;
  };

  // convert meters to kilometers
  const toKm = function (meters) {
    // 1 option: 1.7 km
    // return Math.round((meters / 1000) * 10) / 10;

    // 2 option: 1km 700m
    return { km: Math.trunc(meters / 1000), m: Math.trunc(meters % 1000) };
  };

  const diffLat = degToRad(lat2 - lat1);
  const diffLong = degToRad(lon2 - lon1);

  const harvF =
    Math.sin(diffLat / 2) ** 2 +
    Math.cos(degToRad(lat1)) *
      Math.cos(degToRad(lat2)) *
      Math.sin(diffLong / 2) ** 2;

  const distance = R * Math.atan2(Math.sqrt(harvF), Math.sqrt(1 - harvF));

  return toKm(distance);
};

// Convert LKS94 to WGS84 coordinates
const lks94ToWgs84 = function (E, N) {
  const a = 6378137;
  const e2 = 0.006694380023;
  const k = 0.9998;
  const lon0 = (24 * Math.PI) / 180;

  const radToDec = function (rad) {
    return ((rad * 180) / Math.PI).toFixed(6);
  };

  // Remove false easting
  const x = E - 500000;

  // Meridian distance
  const M = N / k;

  // Footpoint latitude
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));

  const mu = M / (a * (1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256));

  const p =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);

  const sin = Math.sin(p);
  const cos = Math.cos(p);
  const tan = Math.tan(p);

  const ep2 = e2 / (1 - e2);
  const radius = a / Math.sqrt(1 - e2 * sin ** 2);
  const meridian = (a * (1 - e2)) / (1 - e2 * sin ** 2) ** 1.5;

  const T = tan ** 2;
  const C = ep2 * cos ** 2;
  const D = x / (radius * k);

  // Latitude
  const lat =
    p -
    ((radius * tan) / meridian) *
      (D ** 2 / 2 -
        ((5 + 3 * T + 10 * C - 4 * C ** 2 - 9 * ep2) * D ** 4) / 24 +
        ((61 + 90 * T + 298 * C + 45 * T ** 2 - 252 * ep2 - 3 * C ** 2) *
          D ** 6) /
          720);

  // Longitude
  const lon =
    lon0 +
    (D -
      ((1 + 2 * T + C) * D ** 3) / 6 +
      ((5 - 2 * C + 28 * T - 3 * C ** 2 + 8 * ep2 + 24 * T ** 2) * D ** 5) /
        120) /
      cos;

  const coords = [radToDec(lat), radToDec(lon)];
  return coords;
};

// Create HTML files
const getDocumentationHtml = function () {
  const html = `
        <div class="documentation">
          <button class="btn btn--close-documentation">&times;</button>
          <nav class="documentation-nav">
            <ul class="documentation-nav--list"></ul>
          </nav>
          <main class="documentation-content">
            <div class="documentation-content-item visible" data-content="0">
              <h2 class="documentation-content-item--heading"> Elektrinės pridėjimas</h2>
              <p class="documentation-content-item--text">
              Skiltyje „Elektrinės“ paspauskite žalią mygtuką „+ Pridėti elektrinę“. Atsidarys tuščia forma. Elektrinę galima sukurti dviem būdais:
              </p>
              <div class="accordion">
                <div class="accordion-item open">
                  <button class="btn accordion-item--header">
                  <p class="accordion-item--number">1</p>
                  <h3 class="accordion-item--heading">Rankiniu būdu &mdash; užpildant visus laukelius</h3>
                  <i class="accordion-item--icon ph-bold ph-caret-down"></i>
                  </button>
                  <div class="accordion-item-content">
                    <ul class="accordion-item-content--list">
                      <li class="accordion-item-content--item">
                        <p class="accordion-item-content--text">
                        <span>Platuma</span> &mdash; X koordinatė (CE94, LKS-94 arba WGS-84 sistemoje). <span>Privaloma</span>.
                        </p>
                      </li>
                      <li class="accordion-item-content--item">
                        <p class="accordion-item-content--text">
                        <span>Ilguma</span> &mdash; Y koordinatė (CN94, LKS-94 arba WGS-84 sistemoje). <span>Privaloma</span>.
                        </p>
                      </li>
                      <li class="accordion-item-content--item">
                        <p class="accordion-item-content--text">
                        <span>LKS-94</span> &mdash; pažymėkite, jei įvestos koordinatės yra Lietuvos koordinačių sistemos (LKS-94). Koordinatės automatiškai konvertuojamos iš LKS-94 į Globalią koordinačių sistemą (WGS-84), naudojamą „Google Maps“ žemėlapiuose.
                        </p>
                      </li>
                      <li class="accordion-item-content--item">
                        <p class="accordion-item-content--text">
                        <span>Pavadinimas</span> &mdash; elektrinės pavadinimas, rodomas kortelėje ir žemėlapio iššokančiame lange. <span>Privaloma</span>.
                        </p>
                      </li>
                      <li class="accordion-item-content--item">
                        <p class="accordion-item-content--text">
                        <span>Suma</span> &mdash; elektrinės pinigų balansas.
                        <span>Privaloma, negali būti neigiama</span>.
                        </p>
                      </li>
                    </ul>
                  </div>
                </div>
                <div class="accordion-item">
                  <button class="btn accordion-item--header">
                    <p class="accordion-item--number">2</p>
                    <h3 class="accordion-item--heading">
                    Įkeliant „Excel“ failą</h3>
                    <i class="accordion-item--icon ph-bold ph-caret-down"></i>
                  </button>
                  <div class="accordion-item-content">
                    <ul class="accordion-item-content--list">
                      <li class="accordion-item-content--item">
                        <p class="accordion-item-content--text">
                        <span>Failo formatas</span> &mdash; tik .xlsx
                        </p>
                      </li>
                      <li class="accordion-item-content--item">
                        <p class="accordion-item-content--text">
                        <span>Darbalapis</span> &mdash; duomenys skaitomi tik iš darbalapio „Elektrinės“.
                        </p>
                        <img
                          src="./public/images/documentation_1.jpg"
                          alt="Excelio failo darbalapis 'Elektrinės'"
                          draggable="false"
                          class="accordion-item-content--image"
                        />
                      </li>
                      <li class="accordion-item-content--item">
                        <p class="accordion-item-content--text">
                        <span>Stulpelių tvarka</span> &mdash; privaloma nurodyta seka. Duomenys skaitomi iki stulpelio „Suma“ imtinai. <span>Visi tolesni stulpeliai ignoruojami</span>.
                        </p>
                        <img
                          src="./public/images/documentation_2.jpg"
                          alt="Excelio failo darbalapis 'Elektrinės'"
                          draggable="false"
                          class="accordion-item-content--image"
                        />
                      </li>
                      <li class="accordion-item-content--item">
                        <p class="accordion-item-content--text">
                        <span>Koordinatės</span> &mdash; turi būti pateiktos tik viena sistema: WGS-84 arba LKS-94. Dešimtainėms dalims atskirti naudokite tašką, ne kablelį.
                        </p>
                      </li>
                      <li class="accordion-item-content--item">
                        <p class="accordion-item-content--text">
                        <span>Trūkstami duomenys</span> &mdash; sistema juos sugeneruoja automatiškai.
                        </p>
                      </li>
                      <li class="accordion-item-content--item">
                        <p class="accordion-item-content--text">
                        <span>Failo užpildymas</span> &mdash; „Excel“ faile turi būti bent viena duomenų eilutė po pirmosios eilutės, kurioje nurodyti stulpelių pavadinimai.
                        </p>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
            <div class="documentation-content-item" data-content="1">
              <h2 class="documentation-content-item--heading"> Elektrinės funkcionalumas</h2>
                <ul class="documentation-content-list">
                  <li class="documentation-content-list--item">
                    <p><span>Elektrinės pasirinkimas</span> &mdash; paspaudus elektrinės kortelę, žemėlapyje parodoma jos žymeklio vieta.
                    </p>
                  </li>
                  <li class="documentation-content-list--item">
                    <p><span>Paieška</span> &mdash; paspaudus šalia žalio „+“ mygtuko esantį „Ieškoti elektrinės“ mygtuką, atidaromas paieškos laukelis, kuriame galima ieškoti elektrinių pagal pavadinimą arba sumą.
                    </p>
                  </li>
                  <li class="documentation-content-list--item">
                    <p><span>Papildoma informacija</span> &mdash; kairiuoju pelės mygtuku paspaudus žemėlapyje esantį žymeklį, atidaromas informacijos langas.
                    </p>
                  </li>
                  <li class="documentation-content-list--item">
                    <p><span>Papildomas meniu</span> &mdash; dešiniuoju pelės mygtuku paspaudus žymeklį arba elektrinės kortelę (esančią „Elektrinės“ skiltyje), atidaromas meniu su šiomis funkcijomis:
                    </p>
                  </li>
                    <ul class="documentation-content-list indented disc">
                      <li class="documentation-content-list--item">
                        <p><span>Kopijuoti koordinates</span> &mdash; nukopijuojamos elektrinės koordinatės.
                        </p>
                      </li>
                      <li class="documentation-content-list--item">
                        <p><span>Perkelti elektrinę (žymeklio funkcija)</span> &mdash; žemėlapyje galima nutempti žymeklį į naują vietą. Paspaudus žemėlapio viršuje esančią žalią varnelę, naujos koordinatės išsaugomos. Paspaudus „X“, pakeitimai atšaukiami ir atkuriamos pradinės koordinatės.
                        </p>
                      </li>
                      <li class="documentation-content-list--item">
                        <p><span>Redaguoti elektrinę</span> &mdash; atidaroma elektrinės kūrimo forma su esamais duomenimis. Pakeitimai išsaugomi.
                        </p>
                      </li>
                      <li class="documentation-content-list--item">
                        <p><span>Ištrinti elektrinę</span> &mdash; elektrinė pašalinama iš žemėlapio ir sistemos.
                        </p>
                      </li>
                    </ul>
                </ul>
            </div>
            <div class="documentation-content-item" data-content="2">
              <h2 class="documentation-content-item--heading"> Projekto pridėjimas</h2>
              <p class="documentation-content-item--text"> Skiltyje „Projektas“ pateikiama projekto forma. Norėdami pridėti projektą, užpildykite visus laukelius:
              </p>
              <ul class="documentation-content-list indented">
                <li class="documentation-content-list--item">
                  <p><span>Platuma</span> &mdash; X koordinatė (CE94, LKS-94 arba WGS-84 sistemoje). <span>Privaloma</span>.
                  </p>
                </li>
                <li class="documentation-content-list--item">
                  <p><span>Ilguma</span> &mdash; Y koordinatė (CN94, LKS-94 arba WGS-84 sistemoje). <span>Privaloma</span>.
                  </p>
                </li>
                <li class="documentation-content-list--item">
                  <p><span>LKS-94</span> &mdash; pažymėkite, jei įvestos koordinatės yra Lietuvos koordinačių sistemos (LKS-94). <span>Jei koordinačių sistema yra globali, nežymėkite varnelės</span>.
                  </p>
                </li>
                <li class="documentation-content-list--item">
                  <p><span>Elektrinių spindulys į kurį patenka projektas</span> &mdash; nurodomas maksimalus atstumas aplink elektrines. Žemėlapyje atvaizduojamos tos elektrinės, į kurių nustatytą spindulį patenka projektas.
                  </p>
                </li>
              </ul>
            </div>
            <div class="documentation-content-item" data-content="3">
              <h2 class="documentation-content-item--heading"> Atstumo tarp elektrinių ir projekto skaičiavimas </h2>
              <p class="documentation-content-item--text"> Pridėjus projektą, atstumai iki elektrinių automatiškai apskaičiuojami tiesia linija.
              </p>
              <ul class="documentation-content-list indented disc">
                <li class="documentation-content-list--item">
                  <p>Žemėlapyje rodomos elektrinės, į kurių nustatytą spindulį patenka projektas, taikant 500 m paklaidą.
                  </p>
                </li>
                <li class="documentation-content-list--item">
                  <p>Jei tokių elektrinių nėra, rodomos 5 artimiausios elektrinės, esančios ne toliau kaip 5 km už nustatyto spindulio ribos.
                  </p>
                </li>
              </ul>
              <p class="documentation-content-item--text"> Skiltyje „Elektrinės“ rodomos visų elektrinių kortelės su automatiškai apskaičiuotu atstumu nuo kiekvienos elektrinės iki projekto.
              </p>
            </div>
            <div class="documentation-content-item" data-content="4">
              <h2 class="documentation-content-item--heading"> Žemėlapio ir duomenų išsaugojimo ypatumai</h2>
              <p class="documentation-content-item--text"> Žemėlapį galima priartinti ir nutolinti. Rodoma tik Lietuvos teritorija. Paspaudus mygtuką „Palydovas“, įjungiamas palydovinis žemėlapio vaizdas.
              </p>
              <p class="documentation-content-item--text"> <span>Duomenų išsaugojimas</span>
              </p>
              <ul class="documentation-content-list indented disc">
                <li class="documentation-content-list--item">
                  <p>Visos elektrinės ir projekto duomenys saugomi tik toje naršyklėje, kurioje buvo įvesti. Pavyzdžiui, „Chrome“ išsaugoti duomenys bus pasiekiami tik „Chrome“, o „Firefox“ &mdash; tik „Firefox“. Duomenys tarp skirtingų naršyklių nesinchronizuojami.
                  </p>
                </li>
                <li class="documentation-content-list--item">
                  <p>Meniu arba kontekstiniame meniu (paspaudus dešinįjį pelės mygtuką) galima pasirinkti duomenų išvalymo funkciją. Ją pasirinkus, visi elektrinių ir projekto duomenys pašalinami iš naršyklės atminties.
                  </p>
                </li>
              </ul>
            </div>
          </main>
        </div>
        `;

  return html;
};
const getMenuHtml = function () {
  const html = `
          <nav class="main-menu--container">
            <button class="btn btn--close-main-menu">&times;</button>
            <ul class="main-menu--nav">
              <li class="main-menu--nav__item project">
                <i class="main-menu--nav__icon ph-bold ph-house-line"></i>
                <button class="btn main-menu-nav--btn">Projektas</button>
              </li>
              <li class="main-menu--nav__item stations">
                <i class="main-menu--nav__icon ph-bold ph-nuclear-plant"></i>
                <button class="btn main-menu-nav--btn">Elektrinės</button>
              </li>
              <li class="main-menu--nav__item info">
                <i class="main-menu--nav__icon ph-bold ph-book-open-text"></i>
                <button class="btn main-menu-nav--btn">Žinynas</button>
              </li>
              <li class="main-menu--nav__item delete">
                <i class="main-menu--nav__icon ph-bold ph-eraser"></i>
                <button class="btn main-menu-nav--btn">
                  Išvalyti visus duomenis
                </button>
              </li>
            </ul>
            <a
              href="https://antanas-jasiulionis.lt/elektromap/"
              class="main-menu--link"
              draggable="false"
              target="_blank"
              ><p>Apie <span>Elektro</span>map</p>
              <i class="ph-fill ph-arrow-circle-right"></i
            ></a>
          </nav>
          `;
  return html;
};
const getCreateStationFormHtml = function () {
  const html = `
            <form class="form form__station--new hidden" data-form-type="manual">
              <div
                class="form__row toggle__create--form"
                data-description="Sūkurimo būdas"
              >
                <figure class="form__selector">
                  <p class="" data-form="manual">Rankinis</p>
                  <p class="hidden" data-form="excel">Excel</p>
                  <div class="form__selection--container">
                    <p class="form__selection hidden" data-form="manual">
                      Rankinis
                    </p>
                    <p class="form__selection" data-form="excel">Excel</p>
                  </div>
                </figure>
              </div>
              <div class="form__station--new-container" data-form="manual">
                <div
                  class="form__row form__row--coords"
                  data-description="Koordinatės"
                >
                  <input
                    class="form__input form__input--latitude invalid"
                    type="text"
                    name="latitude"
                    placeholder="Platuma"
                    autocomplete="off"
                    inputmode="numeric"
                    value=""
                  />
                  <input
                    class="form__input form__input--longitude invalid"
                    type="text"
                    name="longitude"
                    placeholder="Ilguma"
                    autocomplete="off"
                    inputmode="numeric"
                    value=""
                  />
                  <div class="form--checkbox">
                    <label for="input--create__checkbox">LKS-94</label>
                    <input
                      id="input--create__checkbox"
                      class="form__input--lksToWgs"
                      type="checkbox"
                      autocomplete="off"
                      checked
                    />
                  </div>
                </div>
                <div
                  class="form__row form__row--title"
                  data-description="Pavadinimas"
                >
                  <input
                    class="form__input form__input--title invalid"
                    type="text"
                    placeholder="Pavadinimas"
                    spellcheck="false"
                    name="station-title"
                    autocomplete="off"
                    value=""
                  />
                </div>
                <div
                  class="station__details station__balance"
                  data-description="Elektrinės suma"
                >
                  <span class="station__icon icon--balance"
                    ><i class="ph ph-bank"></i
                  ></span>
                  <span class="station__value">
                    <input
                      class="form__input form__input--balance invalid"
                      type="text"
                      name="balance"
                      placeholder="Suma"
                      autocomplete="off"
                      inputmode="numeric"
                      value=""
                    />
                  </span>
                  <span class="station__unit">€</span>
                </div>
                <div
                  class="station__details station__distance"
                  data-description="Atstumas iki projekto vietos"
                >
                  <span class="station__icon icon--distance"
                    ><i class="ph ph-ruler"></i
                  ></span>
                  <span class="station__value distance--km">&mdash;</span>
                  <span class="station__unit">KM</span>
                  <span class="station__value distance--m">&mdash;</span>
                  <span class="station__unit">M</span>
                </div>
              </div>
              <div
                class="form__station--new-container hidden"
                data-form="excel"
              >
                <div
                  class="form__row excel__row"
                  data-description="Elektrinių kūrimas su excel failu"
                >
                  <label for="input-file">
                    <btn class="btn btn--choose__file">Pasirinkite failą</btn>
                  </label>
                  <p class="excel__row--text">Nepasirinktas failas</p>
                  <input
                    class="input--file hidden"
                    type="file"
                    id="input-file"
                    accept="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  />
                </div>
                <div class="form__row excel__row--checkbox">
                  <div class="form--checkbox">
                    <label for="input-file--checkbox">LKS-94</label>
                    <input
                      id="input-file--checkbox"
                      class="form__input--lksToWgs"
                      type="checkbox"
                      autocomplete="off"
                      checked
                    />
                  </div>
                </div>
              </div>

              <div class="form__row form__row--submit">
                <button
                  class="btn form__btn form__btn--done form__btn--disable"
                  data-description="Sukurti"
                >
                  <i class="ph-bold ph-check"></i>
                </button>
                <button
                  class="btn form__btn form__btn--cancel"
                  data-description="Anuliuoti"
                >
                  <i class="ph-bold ph-x"></i>
                </button>
              </div>
            </form>
    `;
  return html;
};

'use strict';
// Hand-authored COARSE sea-lane backbone (phase 1). [id, lat, lon]. Not for navigation.
// Waypoints sit in open water on typical commercial lanes; edge length = great-circle between nodes
// unless an explicit nm is given (canals). Unverified against charts: see data/sea-lanes/README.md.
const nodes = [
  // North Europe / Atlantic seaboard
  ['NS_S', 52.4, 3.3], ['DOVER', 51.0, 1.5], ['CH_MID', 50.15, -1.0], ['CH_W', 49.6, -5.5],
  ['BISCAY', 46.5, -7.0], ['FINISTERRE', 43.2, -10.0], ['PORT_W', 39.0, -10.5], ['ST_VINCENT', 36.6, -9.9],
  ['CADIZ', 35.9, -6.9], ['GIB', 35.93, -5.6],
  // Mediterranean
  ['ALBORAN', 35.9, -3.0], ['ALG_W', 37.2, 0.5], ['BAL', 39.5, 4.5], ['MARS', 42.6, 5.5], ['LIGUR', 43.3, 8.5],
  ['SARD_S', 38.1, 8.0], ['SICILY', 37.5, 11.2], ['MALTA_S', 35.7, 14.9], ['IONIAN', 36.3, 18.5],
  ['MATAPAN', 36.0, 22.6], ['CRETE_S', 34.3, 25.0], ['LEVANT', 34.0, 34.0], ['PORTSAID', 31.6, 32.3],
  // Suez / Red Sea / Gulf of Aden
  ['SUEZ_S', 29.9, 32.55], ['GOSUEZ', 28.7, 32.95], ['GUBAL', 27.7, 33.75], ['RS_1', 25.5, 35.8], ['RS_2', 22.0, 37.8],
  ['RS_3', 19.0, 39.5], ['RS_4', 15.5, 41.5], ['RS_5', 13.2, 42.9], ['BAB', 12.6, 43.3],
  ['GOA_1', 12.0, 44.2], ['GOA_2', 12.1, 47.0], ['GOA_3', 13.0, 50.0], ['GUARD', 11.9, 52.0], ['SOCO_N', 13.8, 54.0],
  // Arabian Sea / Gulf of Oman / Persian Gulf
  ['AS_1', 16.0, 59.5], ['AS_2', 10.0, 64.0], ['RAS_HADD', 21.9, 61.2], ['GOM_E', 23.5, 60.2], ['GOM', 25.0, 57.5],
  ['HORMUZ', 26.6, 56.5], ['PG1', 26.1, 54.3], ['PG2', 27.0, 51.8], ['PG3', 27.7, 50.4], ['PG4', 29.1, 49.4],
  // India / Sri Lanka / Bay of Bengal
  ['GUJ', 21.5, 68.5], ['KAR', 24.3, 66.6], ['KAR_S', 23.3, 67.0], ['MUM_OFF', 18.8, 72.3], ['KARN', 13.0, 73.5],
  ['KERALA', 9.5, 75.0], ['EIGHT', 8.0, 73.0], ['COMORIN', 7.3, 77.4], ['COL', 6.8, 79.4], ['GALLE_S', 5.8, 80.3],
  ['SL_E', 6.2, 81.9], ['BOB_1', 11.0, 83.0], ['CHN', 13.1, 81.0], ['BOB_2', 15.5, 85.5], ['BOB_3', 20.0, 88.5],
  // Malacca / Singapore / Sunda
  ['SIX', 6.0, 93.5], ['WEH', 6.7, 94.8], ['MAL1', 5.9, 97.0], ['MAL2', 4.5, 99.0], ['MAL3', 2.8, 100.9],
  ['MAL4', 1.9, 102.3], ['SING_W', 1.13, 103.5], ['SING', 1.2, 103.95], ['SING_E', 1.35, 104.55], ['RIAU', 1.2, 105.4],
  ['GASPAR', -2.8, 107.1], ['JAVA_N', -4.3, 106.3], ['SUNDA', -5.95, 105.75], ['SUNDA_SW', -6.6, 104.7],
  // South China Sea / East Asia
  ['SCS_1', 2.2, 105.0], ['SCS_2', 7.0, 108.0], ['SCS_3', 12.5, 111.5], ['SCS_N', 19.8, 115.8],
  ['VUNG', 9.5, 107.8], ['HK_APP', 21.9, 114.3], ['TW_S', 21.3, 119.0], ['TW_STR', 24.3, 119.3], ['ECS1', 26.5, 121.5],
  ['ECS2', 30.8, 123.3], ['KS_W', 32.5, 126.5], ['KS', 33.7, 128.7], ['MIYAKO', 25.6, 126.0], ['PAC_2', 30.0, 135.0],
  ['TOKYO', 34.6, 139.9],
  // Atlantic crossings / West Africa / Cape / Indian Ocean
  ['NATL_1', 48.0, -30.0], ['NATL_2', 43.0, -55.0], ['NATL_3', 40.2, -68.0], ['NY', 40.45, -73.5],
  ['CANARY_W', 27.0, -19.0], ['W_AFR_1', 18.0, -20.0], ['W_AFR_2', 10.0, -18.5], ['GUINEA', 3.0, -8.0], ['GUINEA_E', 4.5, 3.5],
  ['CAPE_NW', -33.7, 17.6], ['CAPE_S', -35.8, 20.0], ['SA_SE', -35.2, 26.0], ['SA_E', -31.8, 32.5],
  ['IO_1', -34.5, 35.0], ['IO_2', -30.0, 60.0], ['IO_3', -20.0, 85.0],
  // Caribbean / Panama
  ['ANEGADA', 18.2, -63.8], ['CARIB', 14.5, -71.0], ['COLON', 9.5, -79.9], ['PANAMA', 8.85, -79.5],
];
// [a, b] or [a, b, {nm, tag}]  tag: 'SUEZ' | 'PANAMA' (can be avoided)
const edges = [
  ['NS_S', 'DOVER'], ['DOVER', 'CH_MID'], ['CH_MID', 'CH_W'], ['CH_W', 'BISCAY'], ['BISCAY', 'FINISTERRE'],
  ['FINISTERRE', 'PORT_W'], ['PORT_W', 'ST_VINCENT'], ['ST_VINCENT', 'CADIZ'], ['CADIZ', 'GIB'], ['GIB', 'ALBORAN'],
  ['ALBORAN', 'ALG_W'], ['ALG_W', 'BAL'], ['BAL', 'MARS'], ['MARS', 'LIGUR'], ['ALG_W', 'SARD_S'], ['SARD_S', 'SICILY'],
  ['SICILY', 'MALTA_S'], ['MALTA_S', 'IONIAN'], ['IONIAN', 'MATAPAN'], ['MATAPAN', 'CRETE_S'], ['CRETE_S', 'LEVANT'],
  ['CRETE_S', 'PORTSAID'], ['LEVANT', 'PORTSAID'],
  ['PORTSAID', 'SUEZ_S', { nm: 87, tag: 'SUEZ' }], ['SUEZ_S', 'GOSUEZ'], ['GOSUEZ', 'GUBAL'], ['GUBAL', 'RS_1'], ['RS_1', 'RS_2'],
  ['RS_2', 'RS_3'], ['RS_3', 'RS_4'], ['RS_4', 'RS_5'], ['RS_5', 'BAB'], ['BAB', 'GOA_1'], ['GOA_1', 'GOA_2'],
  ['GOA_2', 'GOA_3'], ['GOA_3', 'GUARD'], ['GOA_3', 'SOCO_N'], ['SOCO_N', 'AS_1'], ['GUARD', 'AS_2'], ['AS_2', 'EIGHT'],
  ['AS_1', 'RAS_HADD'], ['RAS_HADD', 'GOM_E'], ['GOM_E', 'GOM'], ['GOM', 'HORMUZ'], ['HORMUZ', 'PG1'], ['PG1', 'PG2'],
  ['PG2', 'PG3'], ['PG3', 'PG4'], ['RAS_HADD', 'GUJ'], ['KAR', 'KAR_S'], ['KAR_S', 'GUJ'], ['GUJ', 'MUM_OFF'], ['AS_1', 'MUM_OFF'],
  ['MUM_OFF', 'KARN'], ['KARN', 'KERALA'], ['KERALA', 'COMORIN'], ['KERALA', 'EIGHT'], ['EIGHT', 'COL'], ['COMORIN', 'COL'],
  ['COL', 'GALLE_S'], ['GALLE_S', 'SL_E'], ['SL_E', 'BOB_1'], ['BOB_1', 'CHN'], ['BOB_1', 'BOB_2'], ['BOB_2', 'BOB_3'],
  ['GALLE_S', 'SIX'], ['SIX', 'WEH'], ['WEH', 'MAL1'], ['MAL1', 'MAL2'], ['MAL2', 'MAL3'], ['MAL3', 'MAL4'], ['MAL4', 'SING_W'],
  ['SING_W', 'SING'], ['SING', 'SING_E'], ['SING_E', 'RIAU'], ['RIAU', 'GASPAR'], ['GASPAR', 'JAVA_N'], ['JAVA_N', 'SUNDA'],
  ['SUNDA', 'SUNDA_SW'], ['SUNDA_SW', 'IO_3'],
  ['SING_E', 'SCS_1'], ['SCS_1', 'SCS_2'], ['SCS_2', 'SCS_3'], ['SCS_3', 'SCS_N'], ['SCS_2', 'VUNG'],
  ['SCS_N', 'HK_APP'], ['SCS_N', 'TW_S'], ['TW_S', 'TW_STR'], ['TW_STR', 'ECS1'], ['ECS1', 'ECS2'], ['ECS2', 'KS_W'], ['KS_W', 'KS'],
  ['ECS1', 'MIYAKO'], ['MIYAKO', 'PAC_2'], ['PAC_2', 'TOKYO'],
  ['CH_W', 'NATL_1'], ['NATL_1', 'NATL_2'], ['NATL_2', 'NATL_3'], ['NATL_3', 'NY'], ['NY', 'ANEGADA'],
  ['ST_VINCENT', 'CANARY_W'], ['CADIZ', 'CANARY_W'], ['CANARY_W', 'W_AFR_1'], ['W_AFR_1', 'W_AFR_2'], ['W_AFR_2', 'GUINEA'],
  ['GUINEA', 'GUINEA_E'], ['W_AFR_2', 'CAPE_NW'], ['GUINEA', 'CAPE_NW'], ['CAPE_NW', 'CAPE_S'], ['CAPE_S', 'SA_SE'], ['SA_SE', 'SA_E'], ['SA_SE', 'IO_1'],
  ['IO_1', 'IO_2'], ['IO_2', 'IO_3'],
  ['BISCAY', 'ANEGADA'], ['CANARY_W', 'ANEGADA'], ['ANEGADA', 'CARIB'], ['CARIB', 'COLON'],
  ['COLON', 'PANAMA', { nm: 43, tag: 'PANAMA' }],
];
module.exports = { nodes, edges };

/**
 * Minimal parser for Garmin's .FIT binary format, just enough to pull
 * per-second heart rate / cadence / power / speed out of a Zwift ride's
 * "record" messages.
 *
 * Written by hand instead of using an npm FIT-parsing library, for the same
 * reason the dashboard's charts are hand-rolled SVG: this sandbox has no
 * npm registry access, so any new dependency's behavior can't be verified
 * by actually installing it - only by reading its source. Implementing the
 * (well-documented, stable) binary format directly means every line here
 * can be checked by hand instead of trusted on faith.
 *
 * FIT format references used: the file header, the definition/data message
 * framing, and the "record" message's well-known field numbers (timestamp,
 * heart_rate, cadence, power, distance, speed, altitude) are part of
 * Garmin's public FIT SDK Global Profile and are the same across every
 * FIT-producing device/platform, not something Zwift-specific.
 */

export interface FitRecord {
  timestampMs: number;
  heartRate?: number;
  cadence?: number;
  power?: number;
  speedMps?: number;
  distanceM?: number;
  altitudeM?: number;
}

interface FieldDef {
  fieldNum: number; // -1 marks a developer field we don't interpret, just skip
  size: number;
  baseTypeNum: number;
}

interface MessageDef {
  globalMsgNum: number;
  littleEndian: boolean;
  fields: FieldDef[];
  totalSize: number;
}

const FIT_EPOCH_OFFSET_SEC = 631065600; // seconds between 1970-01-01 and the FIT epoch (1989-12-31T00:00:00Z)
const RECORD_MESG_NUM = 20;

// Field numbers within a "record" message, per the FIT Global Profile.
const FIELD_TIMESTAMP = 253; // common to all FIT messages
const FIELD_ALTITUDE = 2;
const FIELD_HEART_RATE = 3;
const FIELD_CADENCE = 4;
const FIELD_DISTANCE = 5;
const FIELD_SPEED = 6;
const FIELD_POWER = 7;

function readValue(
  view: DataView,
  offset: number,
  baseTypeNum: number,
  littleEndian: boolean
): number | null {
  switch (baseTypeNum) {
    case 0: // enum
    case 2: { // uint8
      const v = view.getUint8(offset);
      return v === 0xff ? null : v;
    }
    case 1: { // sint8
      const v = view.getInt8(offset);
      return v === 0x7f ? null : v;
    }
    case 10: { // uint8z
      const v = view.getUint8(offset);
      return v === 0 ? null : v;
    }
    case 3: { // sint16
      const v = view.getInt16(offset, littleEndian);
      return v === 0x7fff ? null : v;
    }
    case 4: { // uint16
      const v = view.getUint16(offset, littleEndian);
      return v === 0xffff ? null : v;
    }
    case 11: { // uint16z
      const v = view.getUint16(offset, littleEndian);
      return v === 0 ? null : v;
    }
    case 5: { // sint32
      const v = view.getInt32(offset, littleEndian);
      return v === 0x7fffffff ? null : v;
    }
    case 6: { // uint32
      const v = view.getUint32(offset, littleEndian);
      return v === 0xffffffff ? null : v;
    }
    case 12: { // uint32z
      const v = view.getUint32(offset, littleEndian);
      return v === 0 ? null : v;
    }
    case 8: { // float32
      const v = view.getFloat32(offset, littleEndian);
      return Number.isFinite(v) ? v : null;
    }
    case 9: { // float64
      const v = view.getFloat64(offset, littleEndian);
      return Number.isFinite(v) ? v : null;
    }
    default:
      // string / byte-array / 64-bit integer types - not needed for the
      // fields we read, and DataView has no native 64-bit int getters here.
      return null;
  }
}

export interface FitFieldSummary {
  fieldNum: number; // -1 = developer field (we don't decode these - see hasDevFields below)
  baseTypeNum: number;
  isDevField: boolean;
  valuesSeen: number;
  sampleValues: number[];
}

/**
 * Diagnostic-only twin of parseFitRecords: instead of decoding only the
 * known fields (heart rate/cadence/power/...), walks the same RECORD
 * messages and reports every field number actually present, how many
 * non-null values it had, and a few samples - including developer fields,
 * which parseFitRecords intentionally skips (it has no schema for them).
 *
 * Built to answer one concrete question without guessing: when a metric
 * (e.g. cadence, field 4) appears to have no data for every ride, is the
 * field simply absent from these FIT files, or is it present under a
 * developer field / different field number that the known-fields parser
 * above doesn't look at? Exposed via the diagnostics page so this can be
 * checked against a real account's real FIT file.
 */
export function debugRecordFields(buffer: ArrayBuffer): FitFieldSummary[] {
  const summaries = new Map<string, FitFieldSummary>();
  if (buffer.byteLength < 14) return [];

  const view = new DataView(buffer);
  const headerSize = view.getUint8(0);
  const sig = String.fromCharCode(
    view.getUint8(8),
    view.getUint8(9),
    view.getUint8(10),
    view.getUint8(11)
  );
  if (sig !== ".FIT") return [];

  const dataSize = view.getUint32(4, true);
  const bodyStart = headerSize;
  const bodyEnd = Math.min(bodyStart + dataSize, buffer.byteLength);

  const localDefs = new Map<number, MessageDef>();
  let offset = bodyStart;

  try {
    while (offset < bodyEnd) {
      const recordHeader = view.getUint8(offset);
      offset += 1;

      if ((recordHeader & 0x80) !== 0) break; // compressed timestamp header - not seen from Zwift

      const isDefinition = (recordHeader & 0x40) !== 0;
      const localType = recordHeader & 0x0f;

      if (isDefinition) {
        const hasDevFields = (recordHeader & 0x20) !== 0;
        offset += 1; // reserved byte
        const arch = view.getUint8(offset);
        offset += 1;
        const littleEndian = arch === 0;
        const globalMsgNum = view.getUint16(offset, littleEndian);
        offset += 2;
        const numFields = view.getUint8(offset);
        offset += 1;

        const fields: FieldDef[] = [];
        let totalSize = 0;
        for (let i = 0; i < numFields; i++) {
          const fieldNum = view.getUint8(offset);
          const size = view.getUint8(offset + 1);
          const baseTypeByte = view.getUint8(offset + 2);
          offset += 3;
          fields.push({ fieldNum, size, baseTypeNum: baseTypeByte & 0x1f });
          totalSize += size;
        }

        if (hasDevFields) {
          const numDevFields = view.getUint8(offset);
          offset += 1;
          for (let i = 0; i < numDevFields; i++) {
            const devFieldNum = view.getUint8(offset);
            const size = view.getUint8(offset + 1);
            offset += 3;
            totalSize += size;
            // Negative, distinct per dev field number so different dev
            // fields don't collapse into one summary entry.
            fields.push({ fieldNum: -1000 - devFieldNum, size, baseTypeNum: 2 });
          }
        }

        localDefs.set(localType, { globalMsgNum, littleEndian, fields, totalSize });
        continue;
      }

      const def = localDefs.get(localType);
      if (!def) break;

      if (def.globalMsgNum === RECORD_MESG_NUM) {
        let fieldOffset = offset;
        for (const f of def.fields) {
          const isDevField = f.fieldNum <= -1000;
          const value = readValue(view, fieldOffset, f.baseTypeNum, def.littleEndian);
          const key = `${isDevField ? "dev" : "std"}:${f.fieldNum}:${f.baseTypeNum}`;
          let s = summaries.get(key);
          if (!s) {
            s = {
              // Recover the real developer-field number (it was encoded as
              // -1000 - devFieldNum above so it wouldn't collide with
              // standard field numbers) so the diagnostics output is
              // actually readable instead of every dev field showing "-1".
              fieldNum: isDevField ? -1000 - f.fieldNum : f.fieldNum,
              baseTypeNum: f.baseTypeNum,
              isDevField,
              valuesSeen: 0,
              sampleValues: [],
            };
            summaries.set(key, s);
          }
          if (value != null) {
            s.valuesSeen += 1;
            if (s.sampleValues.length < 5) s.sampleValues.push(value);
          }
          fieldOffset += f.size;
        }
      }

      offset += def.totalSize;
    }
  } catch {
    // Truncated/malformed input past this point - return whatever was found.
  }

  return Array.from(summaries.values());
}

export function parseFitRecords(buffer: ArrayBuffer): FitRecord[] {
  const records: FitRecord[] = [];
  if (buffer.byteLength < 14) return records;

  const view = new DataView(buffer);
  const headerSize = view.getUint8(0);

  const sig = String.fromCharCode(
    view.getUint8(8),
    view.getUint8(9),
    view.getUint8(10),
    view.getUint8(11)
  );
  if (sig !== ".FIT") return records;

  const dataSize = view.getUint32(4, true); // header fields are always little-endian
  const bodyStart = headerSize;
  const bodyEnd = Math.min(bodyStart + dataSize, buffer.byteLength);

  const localDefs = new Map<number, MessageDef>();
  let offset = bodyStart;

  try {
    while (offset < bodyEnd) {
      const recordHeader = view.getUint8(offset);
      offset += 1;

      const isCompressedTimestamp = (recordHeader & 0x80) !== 0;
      if (isCompressedTimestamp) {
        // Not produced by the files we've seen from Zwift; stop rather than
        // risk silently misreading the rest of the stream.
        break;
      }

      const isDefinition = (recordHeader & 0x40) !== 0;
      const localType = recordHeader & 0x0f;

      if (isDefinition) {
        const hasDevFields = (recordHeader & 0x20) !== 0;
        offset += 1; // reserved byte
        const arch = view.getUint8(offset);
        offset += 1;
        const littleEndian = arch === 0;
        const globalMsgNum = view.getUint16(offset, littleEndian);
        offset += 2;
        const numFields = view.getUint8(offset);
        offset += 1;

        const fields: FieldDef[] = [];
        let totalSize = 0;
        for (let i = 0; i < numFields; i++) {
          const fieldNum = view.getUint8(offset);
          const size = view.getUint8(offset + 1);
          const baseTypeByte = view.getUint8(offset + 2);
          offset += 3;
          fields.push({ fieldNum, size, baseTypeNum: baseTypeByte & 0x1f });
          totalSize += size;
        }

        if (hasDevFields) {
          const numDevFields = view.getUint8(offset);
          offset += 1;
          for (let i = 0; i < numDevFields; i++) {
            const size = view.getUint8(offset + 1);
            offset += 3;
            totalSize += size;
            fields.push({ fieldNum: -1, size, baseTypeNum: 2 });
          }
        }

        localDefs.set(localType, { globalMsgNum, littleEndian, fields, totalSize });
        continue;
      }

      const def = localDefs.get(localType);
      if (!def) break; // stream desync - stop rather than guess

      if (def.globalMsgNum === RECORD_MESG_NUM) {
        const rec: Partial<FitRecord> = {};
        let fieldOffset = offset;
        let timestampSec: number | null = null;

        for (const f of def.fields) {
          if (f.fieldNum !== -1) {
            const value = readValue(view, fieldOffset, f.baseTypeNum, def.littleEndian);
            switch (f.fieldNum) {
              case FIELD_TIMESTAMP:
                timestampSec = value;
                break;
              case FIELD_HEART_RATE:
                if (value != null) rec.heartRate = value;
                break;
              case FIELD_CADENCE:
                if (value != null) rec.cadence = value;
                break;
              case FIELD_POWER:
                if (value != null) rec.power = value;
                break;
              case FIELD_DISTANCE:
                if (value != null) rec.distanceM = value / 100;
                break;
              case FIELD_SPEED:
                if (value != null) rec.speedMps = value / 1000;
                break;
              case FIELD_ALTITUDE:
                if (value != null) rec.altitudeM = value / 5 - 500;
                break;
              default:
                break;
            }
          }
          fieldOffset += f.size;
        }

        if (timestampSec != null) {
          records.push({ timestampMs: (timestampSec + FIT_EPOCH_OFFSET_SEC) * 1000, ...rec });
        }
      }

      offset += def.totalSize;
    }
  } catch {
    // Truncated/malformed input past this point - return whatever was
    // successfully parsed rather than failing the whole request.
  }

  return records;
}

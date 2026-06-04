/**
 * Entrance fee selection for summaries (keep aligned with next-frontend parkVisitInfoUtils.js).
 */

function feeText(fee) {
  return `${fee?.title || ''} ${fee?.description || ''}`.toLowerCase();
}

function isReservationStyleFee(fee) {
  const text = feeText(fee);
  return (
    /\b(reservation|timed[\s-]*entry|vehicle[\s-]*reservation|day-use[\s-]*permit)\b/i.test(
      text
    ) && !/\b(private\s+vehicle|7[\s-]*day|annual|motorcycle|per\s+person|individual)\b/i.test(
      fee?.title || ''
    )
  );
}

function isAnnualOrInteragencyPassProduct(fee) {
  const title = (fee.title || '').toLowerCase();
  if (/\b(entrance\s+pass|private\s+vehicle|motorcycle|per\s+person|individual)\b/i.test(title)) {
    return false;
  }
  return /\b(america the beautiful|annual pass|interagency|senior pass|military pass|access pass|lifetime)\b/i.test(
    title
  );
}

function isStandardEntranceFee(fee) {
  if (!fee || isReservationStyleFee(fee) || isAnnualOrInteragencyPassProduct(fee)) {
    return false;
  }
  return true;
}

function privateVehiclePriority(fee) {
  const title = (fee.title || '').toLowerCase();
  if (/\b(private\s+vehicle|vehicle\s+pass|automobile|per\s+vehicle)\b/i.test(title)) return 3;
  if (/\b(motorcycle)\b/i.test(title)) return 2;
  if (/\b(per\s+person|individual|foot|bike|bicycle|walk|hike)\b/i.test(title)) return 1;
  return 0;
}

function feeAmount(fee) {
  const amount = parseFloat(fee?.cost);
  return Number.isFinite(amount) ? amount : 0;
}

function pickPrimaryEntranceFee(entranceFees) {
  if (!Array.isArray(entranceFees) || entranceFees.length === 0) return null;

  const fees = entranceFees.filter(Boolean);
  const standard = fees.filter(isStandardEntranceFee);

  if (standard.length > 0) {
    return standard.sort((a, b) => {
      const vehicleRank = privateVehiclePriority(b) - privateVehiclePriority(a);
      if (vehicleRank !== 0) return vehicleRank;
      return feeAmount(b) - feeAmount(a);
    })[0];
  }

  const reservations = fees.filter(isReservationStyleFee);
  if (reservations.length > 0) {
    return reservations.sort((a, b) => feeAmount(a) - feeAmount(b))[0];
  }

  return fees[0];
}

module.exports = {
  pickPrimaryEntranceFee,
  isReservationStyleFee,
  isStandardEntranceFee,
};

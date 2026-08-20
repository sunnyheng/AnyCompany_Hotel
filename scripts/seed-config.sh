#!/usr/bin/env bash
# Seed the room catalog into the bookings table's CONFIG partition.
# The step-up THRESHOLD item is intentionally NOT seeded: the API falls back
# to its environment default until an admin sets one, and re-running this
# script therefore never clobbers an admin's threshold change.
#
# Usage: ./scripts/seed-config.sh <table-name>
set -euo pipefail

TABLE="${1:?usage: seed-config.sh <table-name>}"

put_room() {
  local id="$1" name="$2" desc="$3" price="$4"
  aws dynamodb put-item --table-name "$TABLE" --item "{
    \"pk\":            {\"S\": \"CONFIG\"},
    \"sk\":            {\"S\": \"ROOM#${id}\"},
    \"id\":            {\"S\": \"${id}\"},
    \"name\":          {\"S\": \"${name}\"},
    \"description\":   {\"S\": \"${desc}\"},
    \"pricePerNight\": {\"N\": \"${price}\"}
  }"
  echo "  seeded ROOM#${id} (\$${price}/night)"
}

echo "Seeding room catalog into ${TABLE}"
put_room standard     "Standard King"      "City view, king bed, workspace"        180
put_room deluxe       "Deluxe Terrace"     "Private terrace, marble bath"          320
put_room executive    "Executive Suite"    "Separate living room, lounge access"   780
put_room presidential "Presidential Suite" "Panoramic floor, butler service"      1500

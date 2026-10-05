#!/bin/bash
# ARTEMIS active response — block IP via iptables

ACTION=$1    # add | delete
IP=$4

if [ "$ACTION" = "add" ]; then
  iptables -I INPUT -s "$IP" -j DROP
  iptables -I FORWARD -s "$IP" -j DROP
  echo "[ARTEMIS AR] Blocked IP: $IP" | logger -t artemis-ar
elif [ "$ACTION" = "delete" ]; then
  iptables -D INPUT -s "$IP" -j DROP
  iptables -D FORWARD -s "$IP" -j DROP
  echo "[ARTEMIS AR] Unblocked IP: $IP" | logger -t artemis-ar
fi

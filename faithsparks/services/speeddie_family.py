"""Small room extras: pause-aware bedtime finish with an explicit house rule."""
import time

def safe_finish(room):
    s=room['state']
    return (s['phase']=='ready' and not s['players'][s['currentPlayer']].get('consecutiveDoubles') and not s.get('roll') and not s.get('debts')
            and not s.get('auctions') and not s.get('auction') and not s.get('pendingCard') and not s.get('tradeOffer'))

def finish_due(room, now=None):
    now=time.time() if now is None else now
    if (room.get('lobby') or room.get('pausedAt') or room.get('result') or room.get('closed')
            or room['state'].get('winnerId') or not room.get('deadline') or now<room['deadline'] or not safe_finish(room)):
        return room
    s=room['state'];scores=[]
    for p in s['players']:
        deeds=[q for q in s['spaces'] if q.get('owner')==p['id']]
        # Agreed house rule: cash plus liquidation value, not official short-game rules.
        value=p['cash']+sum((0 if q.get('mortgaged') else q['mortgage'])+
             sum(cost//2 for cost in q.get('buildingCosts',[])) for q in deeds)
        scores.append(dict(player=p['id'],score=value,bankrupt=p.get('bankrupt',False)))
    eligible=[row['score'] for row in scores if not row['bankrupt']]
    best=max(eligible,default=0)
    room['result']=dict(scores=scores,winners=[row['player'] for row in scores if not row['bankrupt'] and row['score']==best])
    room['revision']+=1
    return room

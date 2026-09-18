"""Standalone local multiplayer preview, without the rest of the site's dependencies.
Run: python -m speeddie.dev_server --port 8767 --db /tmp/speeddie-rooms.sqlite
"""
import argparse
import os
from pathlib import Path
from flask import Flask, send_from_directory
from faithsparks.services.speeddie_rooms import SQLiteRooms
from faithsparks.views.speeddie_online import create_blueprint

def make_app(database):
    app=Flask(__name__)
    app.secret_key=os.getenv('SPEEDDIE_DEV_SECRET','local-development-only-do-not-deploy')
    app.config['SPEEDDIE_ROOM_STORE']=SQLiteRooms(database)
    app.register_blueprint(create_blueprint())
    @app.get('/speeddie/')
    @app.get('/speeddie/<path:name>')
    def assets(name='index.html'):
        if name not in {'index.html','app.js','rules.js','engine.js','companion.js','family.js','board.js','online.js','extras.js','token-editor.js','style.css'}:
            return 'Not found',404
        return send_from_directory(Path(__file__).parent,name)
    return app

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8767);parser.add_argument('--db',default='/tmp/speeddie-rooms.sqlite');args=parser.parse_args()
    make_app(args.db).run(host='127.0.0.1',port=args.port,threaded=True)

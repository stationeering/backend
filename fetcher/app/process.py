import vdf
import sys

fileName = sys.argv[1]
branch = sys.argv[2]
field = sys.argv[3]
steamid = sys.argv[4]

with open(fileName, 'r') as f:
        rawFile = f.read()
        d = "\"" + steamid + "\""
        removedTrashBeginning = [d+e for e in rawFile.split(d, 1) if e]
        
        revTrash = removedTrashBeginning[1][::-1]

        d = "}"
        removedTrashEnd = [d+e for e in revTrash.split(d, 1) if e]

        cleanedFile = removedTrashEnd[1][::-1]

        data = vdf.loads(cleanedFile)

        print(data[steamid]["depots"]["branches"][branch][field])
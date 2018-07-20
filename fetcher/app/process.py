import vdf
import sys

fileName = sys.argv[1]
branch = sys.argv[2]
field = sys.argv[3]

with open(fileName, 'r') as f:
        rawFile = f.read()
        d = "\"544550\""

        cleanedFile = [d+e for e in rawFile.split(d, 1) if e]

        print(cleanedFile[1])

        data = vdf.loads(cleanedFile[1])

        print(data["544550"]["depots"]["branches"][branch][field])